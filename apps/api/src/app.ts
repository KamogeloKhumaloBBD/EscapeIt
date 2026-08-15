import { randomUUID } from "node:crypto";

import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
  type Router,
} from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import pinoHttp from "pino-http";

import { normalizeHttpError, toPublicError } from "./errors";
import { createLogger, serializeRequest } from "./logging";

export interface AppDependencies {
  allowedOrigin: string;
  apiRouter: Router;
  authorizationServerMetadataHandler: RequestHandler;
  authHandler: RequestHandler;
  checkDatabase: () => Promise<boolean>;
  customMcpClientMetadataHandler?: RequestHandler;
  logger?: Logger;
  webhookHandler: RequestHandler;
}

export function createApp({
  allowedOrigin,
  apiRouter,
  authorizationServerMetadataHandler,
  authHandler,
  checkDatabase,
  customMcpClientMetadataHandler,
  logger = createLogger(),
  webhookHandler,
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
      serializers: {
        req: serializeRequest,
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      exposedHeaders: ["WWW-Authenticate"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      origin: allowedOrigin,
    }),
  );

  app.get(
    [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/api/auth",
    ],
    authorizationServerMetadataHandler,
  );
  if (customMcpClientMetadataHandler !== undefined) {
    app.get("/oauth/custom-mcp-client.json", customMcpClientMetadataHandler);
  }
  app.all("/api/auth/*splat", authHandler);
  // A GitHub App has one webhook for every installation, so its deliveries
  // arrive without a per-integration token in the path.
  app.post(
    ["/api/webhooks/:provider", "/api/webhooks/:provider/:token"],
    express.raw({ limit: "1mb", type: "application/json" }),
    webhookHandler,
  );

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

  app.use("/api", apiRouter);

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
    const normalized = normalizeHttpError(error);

    if (normalized.status >= 500) {
      request.log.error({ err: error }, "Request failed");
    } else {
      request.log.warn(
        { code: normalized.code, status: normalized.status },
        "Request rejected",
      );
    }

    response.status(normalized.status).json(toPublicError(normalized));
  };

  app.use(errorHandler);

  return app;
}
