import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const entryPoint = path.join(packageRoot, "dist/index.mjs");
const testDataRoot = await mkdtemp(
  path.join(tmpdir(), "picture-flashcards-isolation-"),
);
const staticRoot = path.join(testDataRoot, "static");
await mkdir(staticRoot, { recursive: true });
await writeFile(
  path.join(staticRoot, "index.html"),
  "<!doctype html><html><body><div id=\"root\">flashcards-ui</div></body></html>",
);
await writeFile(path.join(staticRoot, "asset.txt"), "static-asset");

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function startApi(port, dataDirectory, staticDirectory = staticRoot) {
  const child = spawn(process.execPath, [entryPoint], {
    cwd: packageRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      APPLICATION_NAME: "picture-flashcards-api-test",
      INSTANCE_NAME: "isolation-test",
      HOST: "127.0.0.1",
      PORT: String(port),
      FLASHCARDS_DATA_DIR: dataDirectory,
      FLASHCARDS_STATIC_DIR: staticDirectory,
      SESSION_SECRET: "must-not-appear-in-logs",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  child.output = () => output;
  return child;
}

async function waitForHealth(child, port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API exited before becoming healthy:\n${child.output()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
      if (response.ok) return response;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`API did not become healthy:\n${child.output()}`);
}

async function waitForExit(child) {
  if (child.exitCode !== null) return child.exitCode;
  const [code] = await once(child, "exit");
  return code;
}

async function stopApi(child) {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await waitForExit(child);
  }
}

test.after(async () => {
  await rm(testDataRoot, { recursive: true, force: true });
});

test("rejects occupied ports without affecting the existing listener and shuts down cleanly", async () => {
  const port = await getFreePort();
  const first = startApi(port, path.join(testDataRoot, "first"));
  let second;

  try {
    const response = await waitForHealth(first, port);
    assert.deepEqual(await response.json(), { status: "ok" });

    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /flashcards-ui/);

    const clientRoute = await fetch(`http://127.0.0.1:${port}/admin`);
    assert.equal(clientRoute.status, 200);
    assert.match(await clientRoute.text(), /flashcards-ui/);

    const asset = await fetch(`http://127.0.0.1:${port}/asset.txt`);
    assert.equal(asset.status, 200);
    assert.equal(await asset.text(), "static-asset");

    const missingApiRoute = await fetch(
      `http://127.0.0.1:${port}/api/does-not-exist`,
    );
    assert.equal(missingApiRoute.status, 404);

    second = startApi(port, path.join(testDataRoot, "second"));
    const secondExitCode = await waitForExit(second);
    assert.notEqual(secondExitCode, 0);
    assert.match(second.output(), /could not bind its requested listener|EADDRINUSE/);
    assert.doesNotMatch(second.output(), /must-not-appear-in-logs/);

    const firstStillHealthy = await fetch(`http://127.0.0.1:${port}/api/healthz`);
    assert.equal(firstStillHealthy.status, 200);

    await stopApi(first);
    await assert.rejects(
      fetch(`http://127.0.0.1:${port}/api/healthz`),
      /fetch failed|ECONNREFUSED/,
    );

    const replacement = startApi(port, path.join(testDataRoot, "replacement"));
    try {
      const replacementResponse = await waitForHealth(replacement, port);
      assert.equal(replacementResponse.status, 200);
    } finally {
      await stopApi(replacement);
    }
  } finally {
    await stopApi(first);
    if (second) await stopApi(second);
  }
});