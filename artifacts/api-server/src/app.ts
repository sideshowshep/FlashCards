import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "node:path";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "35mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const staticDirectory = process.env.FLASHCARDS_STATIC_DIR
  ? path.resolve(process.env.FLASHCARDS_STATIC_DIR)
  : undefined;

if (staticDirectory) {
  const indexFile = path.join(staticDirectory, "index.html");

  app.use(express.static(staticDirectory, { index: false }));
  app.use((req, res, next) => {
    if (
      (req.method !== "GET" && req.method !== "HEAD")
      || req.path === "/api"
      || req.path.startsWith("/api/")
    ) {
      next();
      return;
    }

    res.sendFile(indexFile, (error) => {
      if (error) next(error);
    });
  });
}

export default app;
