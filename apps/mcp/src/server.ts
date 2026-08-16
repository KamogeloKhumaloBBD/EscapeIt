import {
  appendActivityEvent,
  checkDatabaseReadiness,
  createDatabaseConnection,
  findIntegrationAccountForMember,
  findIntegrationBundleProviderKeys,
  findIntegrationBundleCustomMcpServerIds,
  findMemberIntegrationAccess,
  listReadyCustomMcpAccess,
  markCustomMcpOAuthAccountAuthenticationError,
  markIntegrationAccountAuthenticationError,
  replaceCustomMcpAccountCredentials,
  replaceIntegrationAccountCredentials,
  resolveMcpToken,
  resolveOAuthAccessToken,
} from "@context-layer/db";
import {
  createBitbucketProviderModule,
  createConfluenceProviderModule,
  createGitHubProviderModule,
  createJiraProviderModule,
  createProviderAccountRuntime,
  isProviderModule,
  type ProviderModule,
} from "@context-layer/integrations";
import {
  createMcpGateway,
  createCustomMcpGatewayToolProvider,
  createProtectedResourceMetadataHandler,
} from "@context-layer/mcp-runtime";
import { createCredentialEncryption } from "@context-layer/security";

import { createMcpApp } from "./app";
import { parseMcpConfig } from "./config";
import { createLogger } from "./logging";

const config = parseMcpConfig(process.env);
const logger = createLogger(process.env.LOG_LEVEL ?? "info");
const connection = createDatabaseConnection(config.database);
const credentialEncryption = createCredentialEncryption(
  config.credentialEncryptionKey,
);

const providerModules: ProviderModule[] = [
  createJiraProviderModule({
    oauth: config.atlassianOAuth,
    publicAppUrl: config.publicAppUrl,
  }),
  createConfluenceProviderModule({
    oauth: config.atlassianOAuth,
    publicAppUrl: config.publicAppUrl,
  }),
  createBitbucketProviderModule({
    oauth: config.bitbucketOAuth,
    publicAppUrl: config.publicAppUrl,
  }),
  createGitHubProviderModule({
    app: config.githubApp,
    publicAppUrl: config.publicAppUrl,
  }),
].filter(isProviderModule);

const providerAccountRuntime = createProviderAccountRuntime({
  credentialEncryption,
  repository: {
    findAccount: (workspaceId, integrationId, membershipId) =>
      findIntegrationAccountForMember(
        connection.client,
        workspaceId,
        integrationId,
        membershipId,
      ),
    markAccountAuthenticationError: (input) =>
      markIntegrationAccountAuthenticationError(connection.client, input),
    replaceAccountCredentials: (input, expectedEnvelope) =>
      replaceIntegrationAccountCredentials(
        connection.client,
        input,
        expectedEnvelope,
      ),
  },
});

const toolProviders = providerModules.flatMap((providerModule) => {
  if (providerModule.createMcpToolProvider === undefined) return [];

  return [
    {
      provider: providerModule.definition.key,
      toolProvider: providerModule.createMcpToolProvider({
        accountRuntime: providerAccountRuntime,
        repository: {
          appendActivity: (input) =>
            appendActivityEvent(connection.client, input),
          findAccess: (workspaceId, membershipId, provider) =>
            findMemberIntegrationAccess(
              connection.client,
              workspaceId,
              membershipId,
              provider,
            ),
        },
      }),
    },
  ];
});

const customToolProvider = createCustomMcpGatewayToolProvider({
  credentialEncryption,
  publicAppUrl: config.publicAppUrl,
  repository: {
    appendActivity: (input) => appendActivityEvent(connection.client, input),
    listReady: (workspaceId, membershipId, allowedServerIds) =>
      listReadyCustomMcpAccess(
        connection.client,
        workspaceId,
        membershipId,
        allowedServerIds,
      ),
    markAccountAuthenticationError: (input) =>
      markCustomMcpOAuthAccountAuthenticationError(connection.client, input),
    replaceCredentials: (input) =>
      replaceCustomMcpAccountCredentials(connection.client, input),
  },
});

const app = createMcpApp({
  allowedOrigin: config.publicAppUrl,
  checkDatabase: () => checkDatabaseReadiness(connection),
  logger,
  mcpHandler: createMcpGateway({
    customToolProvider,
    logger,
    publicAppUrl: config.publicAppUrl,
    resolveBundleProviderKeys: async (workspaceId, bundleId) =>
      new Set(
        await findIntegrationBundleProviderKeys(
          connection.client,
          workspaceId,
          bundleId,
        ),
      ),
    resolveBundleCustomMcpServerIds: async (workspaceId, bundleId) =>
      new Set(
        await findIntegrationBundleCustomMcpServerIds(
          connection.client,
          workspaceId,
          bundleId,
        ),
      ),
    resolveOAuthToken: (token) =>
      resolveOAuthAccessToken(connection.client, token),
    resolveToken: (tokenHash) => resolveMcpToken(connection.client, tokenHash),
    toolProviders,
  }),
  protectedResourceMetadataHandler: createProtectedResourceMetadataHandler({
    publicAppUrl: config.publicAppUrl,
  }),
});

const server = app.listen(config.port, "::", () => {
  logger.info(
    {
      port: config.port,
      replicaId: process.env.RAILWAY_REPLICA_ID,
      replicaRegion: process.env.RAILWAY_REPLICA_REGION,
    },
    "Context Layer MCP listening",
  );
});

function shutDown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "Shutting down Context Layer MCP");
  server.closeIdleConnections();

  server.close((error) => {
    void connection.close().finally(() => {
      if (error !== undefined) {
        logger.error({ err: error }, "MCP shutdown failed");
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
