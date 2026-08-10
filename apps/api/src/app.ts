import { randomUUID } from "node:crypto";

import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import helmet from "helmet";
import pino, { type Logger } from "pino";
import pinoHttp from "pino-http";

import { toPublicError } from "./errors.js";

export interface AppDependencies {
  allowedOrigin: string;
  authHandler: RequestHandler;
  checkDatabase: () => Promise<boolean>;
  logger?: Logger;
}

export function createApp({
  allowedOrigin,
  authHandler,
  checkDatabase,
  logger = pino(),
}: AppDependencies) {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    pinoHttp({
      genReqId(request, response) {
        const incomingId = request.headers["x-correlation-id"];
        const requestId =
          typeof incomingId === "string" && incomingId.length <= 128
            ? incomingId
            : randomUUID();
        response.setHeader("x-correlation-id", requestId);
        return requestId;
      },
      logger,
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      origin: allowedOrigin,
    }),
  );

  app.all("/api/auth/*splat", authHandler);

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_request, response, next) => {
    try {
      const databaseIsReady = await checkDatabase();

      if (!databaseIsReady) {
        response.status(503).json({ database: "down", status: "degraded" });
        return;
      }

      response.status(200).json({ database: "up", status: "ok" });
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
      },
    });
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    request,
    response,
    _next,
  ) => {
    request.log.error({ err: error }, "Unhandled request error");
    response.status(500).json(toPublicError(error));
  };

  app.use(errorHandler);

  return app;
}
