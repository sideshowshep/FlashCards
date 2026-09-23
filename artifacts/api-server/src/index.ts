import app from "./app";
import { logger } from "./lib/logger";
import path from "node:path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const host = process.env["HOST"]
  ?? (process.env["REPL_ID"] ? "0.0.0.0" : "127.0.0.1");
const hostSource = process.env["HOST"]
  ? "environment"
  : process.env["REPL_ID"]
    ? "replit-default"
    : "local-default";
const application = process.env["APPLICATION_NAME"] ?? "picture-flashcards-api";
const instance = process.env["INSTANCE_NAME"] ?? "default";
const environment = process.env["NODE_ENV"] ?? "development";
const dataDirectory = path.resolve(
  process.env["FLASHCARDS_DATA_DIR"] ?? path.join(process.cwd(), "data"),
);
const automaticStartup = process.env["AUTOMATIC_STARTUP"] ?? "unknown";
const staticDirectory = process.env["FLASHCARDS_STATIC_DIR"]
  ? path.resolve(process.env["FLASHCARDS_STATIC_DIR"])
  : "disabled";

const server = app.listen(port, host);
let shuttingDown = false;

server.on("listening", () => {
  logger.info(
    {
      application,
      instance,
      environment,
      pid: process.pid,
      ppid: process.ppid,
      cwd: process.cwd(),
      host,
      hostSource,
      port,
      primaryListener: `${host}:${port}`,
      additionalListeners: "none",
      staticDirectory,
      dataDirectory,
      automaticStartup,
    },
    "Application started",
  );
});

server.on("error", (error: NodeJS.ErrnoException) => {
  logger.error(
    {
      application,
      host,
      port,
      code: error.code,
      message: error.message,
      inspectCommand: `lsof -nP -iTCP:${port} -sTCP:LISTEN`,
    },
    "Application could not bind its requested listener",
  );
  process.exitCode = 1;
});

const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ application, signal, pid: process.pid }, "Application shutting down");
  server.close((error) => {
    if (error) {
      logger.error({ application, signal, err: error }, "Application shutdown failed");
      process.exitCode = 1;
    } else {
      logger.info({ application, signal, port }, "Application stopped");
    }
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);
