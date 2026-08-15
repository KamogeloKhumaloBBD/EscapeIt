import { randomUUID } from "node:crypto";

import cors from "cors";
import express, { type RequestHandler } from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import pinoHttp from "pino-http";

import { createLogger, serializeRequest } from "./logging";

export interface McpAppDependencies {
  allowedOrigin: string;
  checkDatabase: () => Promise<boolean>;
  logger?: Logger;
  mcpHandler: RequestHandler;
  protectedResourceMetadataHandler: RequestHandler;
}

export function createMcpApp({
  allowedOrigin,
  checkDatabase,
  logger = createLogger(),
  mcpHandler,
  protectedResourceMetadataHandler,
}: McpAppDependencies) {
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
      serializers: {
        req: serializeRequest,
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      credentials: false,
      exposedHeaders: ["WWW-Authenticate"],
      methods: ["GET", "POST", "OPTIONS"],
      origin: allowedOrigin,
    }),
  );

  app.get(
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
      "/api/mcp/.well-known/oauth-protected-resource",
    ],
    protectedResourceMetadataHandler,
  );
  app.all("/api/mcp", mcpHandler);

  app.get("/health", async (_request, response) => {
    try {
      if (!(await checkDatabase())) {
        response.status(503).json({ database: "down", status: "degraded" });
        return;
      }

      response.status(200).json({ database: "up", status: "ok" });
    } catch {
      response.status(503).json({ database: "down", status: "degraded" });
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

  return app;
}
