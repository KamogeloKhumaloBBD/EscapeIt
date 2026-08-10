import {
  checkDatabaseReadiness,
  createDatabaseConnection,
} from "@context-layer/db";
import { toNodeHandler } from "better-auth/node";
import pino from "pino";

import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { parseApiConfig } from "./config/env.js";

const config = parseApiConfig(process.env);
const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const connection = createDatabaseConnection(config.database);
const authService = createAuth({
  authEmailFrom: config.authEmailFrom,
  baseUrl: config.betterAuthUrl,
  databaseUrl: config.database.url,
  resendApiKey: config.resendApiKey,
  secret: config.betterAuthSecret,
  trustedOrigins: [config.publicAppUrl],
});
const app = createApp({
  allowedOrigin: config.publicAppUrl,
  authHandler: toNodeHandler(authService.auth),
  checkDatabase: () => checkDatabaseReadiness(connection),
  logger,
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "Context Layer API listening");
});

function shutDown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "Shutting down Context Layer API");
  server.closeIdleConnections();

  server.close((error) => {
    void Promise.all([connection.close(), authService.close()]).finally(() => {
      if (error !== undefined) {
        logger.error({ err: error }, "API shutdown failed");
        process.exitCode = 1;
      }
    });
  });
}

process.once("SIGINT", () => {
  shutDown("SIGINT");
});
process.once("SIGTERM", () => {
  shutDown("SIGTERM");
});
