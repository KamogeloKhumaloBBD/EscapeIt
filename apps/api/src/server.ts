import {
  appendActivityEvent,
  checkDatabaseReadiness,
  configureIntegration,
  createDatabaseConnection,
  createWorkspaceForUser,
  disconnectIntegrationAccount,
  disconnectWorkspaceIntegration,
  ensureIntegrationAccount,
  findIntegrationAccountForMember,
  findCurrentWorkspaceForUser,
  findWorkspaceIntegration,
  getWorkspaceOverviewForUser,
  listIntegrationScopes,
  listWorkspaceIntegrations,
  markIntegrationAccountValidated,
  markWorkspaceIntegrationValidated,
  parseProviderKey,
  parseScopeKey,
  replaceIntegrationAccountCredentials,
  replaceIntegrationScopes,
  saveIntegrationAccount,
  type ProviderKey,
} from "@context-layer/db";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { Router } from "express";
import pino from "pino";

import { createApp } from "./app";
import { createAuth } from "./auth";
import { parseApiConfig } from "./config/env";
import { createIntegrationRouter } from "./features/integrations/integration.routes";
import {
  createIntegrationService,
  type IntegrationServiceDependencies,
} from "./features/integrations/integration.service";
import { createWorkspaceRouter } from "./features/workspaces/workspace.routes";
import { createWorkspaceService } from "./features/workspaces/workspace.service";
import { createRequireAuthentication } from "./http/authentication";
import { createJiraAdapter } from "./integrations/jira-adapter";
import {
  createProviderRegistry,
  type ProviderDefinition,
} from "./integrations/provider-registry";
import { createCredentialEncryption } from "./security/credential-encryption";

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
const credentialEncryption = createCredentialEncryption(
  config.credentialEncryptionKey,
);
const providerDefinitions: ProviderDefinition[] = [];
const integrationAdapters = new Map<
  ProviderKey,
  ReturnType<typeof createJiraAdapter>
>();

if (config.atlassianOAuth !== null) {
  const jiraProvider = parseProviderKey("jira");
  providerDefinitions.push({
    capabilities: ["context", "user-accounts", "scopes"],
    description: "Bring Jira projects and work items into your context layer.",
    displayName: "Jira",
    key: jiraProvider,
    notificationEvents: [],
    scopeKinds: [
      {
        displayName: "Project",
        key: parseScopeKey("jira.project"),
      },
    ],
  });
  integrationAdapters.set(
    jiraProvider,
    createJiraAdapter({
      ...config.atlassianOAuth,
      redirectUri: new URL(
        "/api/integrations/jira/oauth/callback",
        config.publicAppUrl,
      ).toString(),
    }),
  );
}

const providerRegistry = createProviderRegistry(providerDefinitions);
const workspaceRepository = {
  createForUser: (input: Parameters<typeof createWorkspaceForUser>[1]) =>
    createWorkspaceForUser(connection.client, input),
  findForUser: (userId: string) =>
    findCurrentWorkspaceForUser(connection.client, userId),
  getOverviewForUser: (userId: string) =>
    getWorkspaceOverviewForUser(connection.client, userId, 5),
};
const workspaceService = createWorkspaceService(workspaceRepository);
const integrationRepository: IntegrationServiceDependencies["repository"] = {
  appendActivity: (input: Parameters<typeof appendActivityEvent>[1]) =>
    appendActivityEvent(connection.client, input),
  configure: (input: Parameters<typeof configureIntegration>[1]) =>
    configureIntegration(connection.client, input),
  disconnectAccount: (workspaceId, integrationId, membershipId) =>
    disconnectIntegrationAccount(
      connection.client,
      workspaceId,
      integrationId,
      membershipId,
    ),
  disconnectInstallation: (workspaceId, integrationId, membershipId) =>
    disconnectWorkspaceIntegration(
      connection.client,
      workspaceId,
      integrationId,
      membershipId,
    ),
  ensureAccount: (workspaceId, membershipId, provider) =>
    ensureIntegrationAccount(
      connection.client,
      workspaceId,
      membershipId,
      provider,
    ),
  findAccount: (workspaceId, integrationId, membershipId) =>
    findIntegrationAccountForMember(
      connection.client,
      workspaceId,
      integrationId,
      membershipId,
    ),
  findCurrentWorkspace: (userId: string) =>
    findCurrentWorkspaceForUser(connection.client, userId),
  findIntegration: (workspaceId, membershipId, provider) =>
    findWorkspaceIntegration(
      connection.client,
      workspaceId,
      membershipId,
      provider,
    ),
  listIntegrations: (workspaceId, membershipId) =>
    listWorkspaceIntegrations(connection.client, workspaceId, membershipId),
  listScopes: (workspaceId, integrationId, membershipId) =>
    listIntegrationScopes(
      connection.client,
      workspaceId,
      integrationId,
      membershipId,
    ),
  markAccountValidated: (workspaceId, integrationId, membershipId) =>
    markIntegrationAccountValidated(
      connection.client,
      workspaceId,
      integrationId,
      membershipId,
    ),
  markInstallationValidated: (workspaceId, integrationId, membershipId) =>
    markWorkspaceIntegrationValidated(
      connection.client,
      workspaceId,
      integrationId,
      membershipId,
    ),
  replaceAccountCredentials: (
    input: Parameters<typeof replaceIntegrationAccountCredentials>[1],
    expectedEnvelope: Parameters<
      typeof replaceIntegrationAccountCredentials
    >[2],
  ) =>
    replaceIntegrationAccountCredentials(
      connection.client,
      input,
      expectedEnvelope,
    ),
  replaceScopes: (workspaceId, integrationId, membershipId, scopes) =>
    replaceIntegrationScopes(
      connection.client,
      workspaceId,
      integrationId,
      membershipId,
      scopes,
    ),
  saveAccount: (input: Parameters<typeof saveIntegrationAccount>[1]) =>
    saveIntegrationAccount(connection.client, input),
};
const integrationService = createIntegrationService({
  adapters: integrationAdapters,
  credentialEncryption,
  oauthStateSecret: config.betterAuthSecret,
  providerRegistry,
  repository: integrationRepository,
});
const apiRouter = Router();
apiRouter.use(
  "/workspaces",
  createWorkspaceRouter({ requireAuthentication, service: workspaceService }),
);
apiRouter.use(
  "/integrations",
  createIntegrationRouter({
    nodeEnvironment: config.nodeEnvironment,
    oauthStateSecret: config.betterAuthSecret,
    publicAppUrl: config.publicAppUrl,
    requireAuthentication,
    service: integrationService,
  }),
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
