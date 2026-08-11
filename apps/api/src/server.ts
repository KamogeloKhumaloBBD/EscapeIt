import {
  checkDatabaseReadiness,
  createDatabaseConnection,
  createWorkspaceForUser,
  findCurrentWorkspaceForUser,
  getWorkspaceOverviewForUser,
} from "@context-layer/db";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { Router } from "express";
import pino from "pino";

import { createApp } from "./app";
import { createAuth } from "./auth";
import { parseApiConfig } from "./config/env";
import { createWorkspaceRouter } from "./features/workspaces/workspace.routes";
import { createWorkspaceService } from "./features/workspaces/workspace.service";
import { createRequireAuthentication } from "./http/authentication";

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
const requireAuthentication = createRequireAuthentication({
  async getSession(headers) {
    const session = await authService.auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });

    if (session === null) {
      return null;
    }

    return {
      user: {
        email: session.user.email,
        id: session.user.id,
        name: session.user.name,
      },
    };
  },
});
const workspaceRepository = {
  createForUser: (input: Parameters<typeof createWorkspaceForUser>[1]) =>
    createWorkspaceForUser(connection.client, input),
  findForUser: (userId: string) =>
    findCurrentWorkspaceForUser(connection.client, userId),
  getOverviewForUser: (userId: string) =>
    getWorkspaceOverviewForUser(connection.client, userId, 5),
};
const workspaceService = createWorkspaceService(workspaceRepository);
const apiRouter = Router();
apiRouter.use(
  "/workspaces",
  createWorkspaceRouter({ requireAuthentication, service: workspaceService }),
);
const app = createApp({
  allowedOrigin: config.publicAppUrl,
  apiRouter,
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
