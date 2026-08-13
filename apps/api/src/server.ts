import {
  appendActivityEvent,
  acceptWorkspaceInvitation,
  checkDatabaseReadiness,
  connectIntegrationAccountWithResource,
  configureIntegration,
  createDatabaseConnection,
  createMcpToken,
  createWorkspaceForUser,
  createWorkspaceInvitation,
  disconnectIntegrationAccount,
  disconnectWorkspaceIntegration,
  ensureIntegrationAccount,
  findIntegrationAccountForMember,
  findMemberIntegrationAccess,
  findMcpOAuthClient,
  findWorkspaceInvitationByToken,
  findCurrentWorkspaceForUser,
  findWorkspaceIntegration,
  getWorkspaceOverviewForUser,
  getWorkspaceUsageAnalytics,
  listIntegrationScopes,
  listIntegrationMcpTools,
  listMcpTokens,
  listMcpOAuthConnections,
  listPendingWorkspaceInvitations,
  listWorkspaceMembers,
  listWorkspaceMemberUsage,
  listWorkspaceToolUsage,
  listWorkspaceIntegrations,
  markIntegrationAccountValidated,
  markWorkspaceInvitationDeliveryFailed,
  markWorkspaceIntegrationValidated,
  replaceIntegrationAccountCredentials,
  replaceIntegrationMcpTools,
  replaceIntegrationScopes,
  resolveMcpToken,
  resolveOAuthAccessToken,
  revokeMcpToken,
  revokeMcpOAuthConnection,
  revokeWorkspaceInvitation,
  saveIntegrationAccount,
} from "@context-layer/db";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { Router } from "express";

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
import { createMcpAccessRouter } from "./features/mcp-access/mcp-access.routes";
import {
  createMcpAccessService,
  type McpAccessServiceDependencies,
} from "./features/mcp-access/mcp-access.service";
import { createMcpGateway } from "./features/mcp-access/mcp-gateway";
import { createMcpConnectionRouter } from "./features/mcp-access/mcp-connection.routes";
import { createMcpConnectionService } from "./features/mcp-access/mcp-connection.service";
import { createProtectedResourceMetadataHandler } from "./features/mcp-access/mcp-oauth-metadata";
import { createInvitationEmailSender } from "./features/members/invitation-email";
import { createMemberRouter } from "./features/members/member.routes";
import {
  createMemberService,
  type MemberServiceDependencies,
} from "./features/members/member.service";
import { createRequireAuthentication } from "./http/authentication";
import { createWebRequestHandler } from "./http/web-request-handler";
import { createJiraProviderModule } from "./integrations/jira";
import { createConfluenceProviderModule } from "./integrations/confluence";
import { createLogger } from "./logging";
import {
  isProviderModule,
  type ProviderModule,
} from "./integrations/provider-module";
import { createProviderRegistry } from "./integrations/provider-registry";
import { createProviderAccountRuntime } from "./integrations/provider-account-runtime";
import { createCredentialEncryption } from "./security/credential-encryption";

const config = parseApiConfig(process.env);
const logger = createLogger(process.env.LOG_LEVEL ?? "info");

if (/@resend\.dev(?:>|$)/i.test(config.authEmailFrom)) {
  logger.warn(
    "The Resend test sender can deliver only to the email address associated with the Resend account",
  );
}
const connection = createDatabaseConnection(config.database);
const authService = createAuth({
  authEmailFrom: config.authEmailFrom,
  baseUrl: config.betterAuthUrl,
  databaseUrl: config.database.url,
  logger,
  mcpResourceUrl: `${config.publicAppUrl.replace(/\/$/, "")}/api/mcp`,
  resendApiKey: config.resendApiKey,
  secret: config.betterAuthSecret,
  trustedOrigins: [config.publicAppUrl],
  findWorkspaceIdForUser: async (userId) =>
    (await findCurrentWorkspaceForUser(connection.client, userId))?.workspace
      .id ?? null,
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
const providerModules: ProviderModule[] = [
  createJiraProviderModule({
    oauth: config.atlassianOAuth,
    publicAppUrl: config.publicAppUrl,
  }),
  createConfluenceProviderModule({
    oauth: config.atlassianOAuth,
    publicAppUrl: config.publicAppUrl,
  }),
].filter(isProviderModule);
const providerRegistry = createProviderRegistry(
  providerModules.map((providerModule) => providerModule.definition),
);
const integrationAdapters = new Map(
  providerModules.map(
    (providerModule) =>
      [providerModule.definition.key, providerModule.adapter] as const,
  ),
);
const workspaceRepository = {
  createForUser: (input: Parameters<typeof createWorkspaceForUser>[1]) =>
    createWorkspaceForUser(connection.client, input),
  findForUser: (userId: string) =>
    findCurrentWorkspaceForUser(connection.client, userId),
  getOverviewForUser: (userId: string) =>
    getWorkspaceOverviewForUser(connection.client, userId, 5),
  getAnalytics: (input: Parameters<typeof getWorkspaceUsageAnalytics>[1]) =>
    getWorkspaceUsageAnalytics(connection.client, input),
  listMemberUsage: (input: Parameters<typeof listWorkspaceMemberUsage>[1]) =>
    listWorkspaceMemberUsage(connection.client, input),
  listToolUsage: (input: Parameters<typeof listWorkspaceToolUsage>[1]) =>
    listWorkspaceToolUsage(connection.client, input),
};
const workspaceService = createWorkspaceService(workspaceRepository);
const mcpAccessRepository: McpAccessServiceDependencies["repository"] = {
  createToken: (input) => createMcpToken(connection.client, input),
  findCurrentWorkspace: (userId) =>
    findCurrentWorkspaceForUser(connection.client, userId),
  listTokens: (workspaceId, requestingMembershipId) =>
    listMcpTokens(connection.client, workspaceId, requestingMembershipId),
  revokeToken: (workspaceId, tokenId, requestingMembershipId, correlationId) =>
    revokeMcpToken(
      connection.client,
      workspaceId,
      tokenId,
      requestingMembershipId,
      correlationId,
    ),
};
const mcpAccessService = createMcpAccessService({
  repository: mcpAccessRepository,
});
const mcpConnectionService = createMcpConnectionService({
  findClient: (clientId) => findMcpOAuthClient(connection.client, clientId),
  listConnections: (userId) =>
    listMcpOAuthConnections(connection.client, userId),
  revokeConnection: (userId, consentId) =>
    revokeMcpOAuthConnection(connection.client, userId, consentId),
});
const memberRepository: MemberServiceDependencies["repository"] = {
  acceptInvitation: (input) =>
    acceptWorkspaceInvitation(connection.client, input),
  createInvitation: (input) =>
    createWorkspaceInvitation(connection.client, input),
  findCurrentWorkspace: (userId) =>
    findCurrentWorkspaceForUser(connection.client, userId),
  findInvitation: (tokenHash) =>
    findWorkspaceInvitationByToken(connection.client, tokenHash),
  listMembers: (workspaceId, membershipId) =>
    listWorkspaceMembers(connection.client, workspaceId, membershipId),
  listPendingInvitations: (workspaceId, ownerMembershipId) =>
    listPendingWorkspaceInvitations(
      connection.client,
      workspaceId,
      ownerMembershipId,
    ),
  markDeliveryFailed: (
    workspaceId,
    invitationId,
    ownerMembershipId,
    correlationId,
  ) =>
    markWorkspaceInvitationDeliveryFailed(
      connection.client,
      workspaceId,
      invitationId,
      ownerMembershipId,
      correlationId,
    ),
  revokeInvitation: (
    workspaceId,
    invitationId,
    ownerMembershipId,
    correlationId,
  ) =>
    revokeWorkspaceInvitation(
      connection.client,
      workspaceId,
      invitationId,
      ownerMembershipId,
      correlationId,
    ),
};
const memberService = createMemberService({
  emailSender: createInvitationEmailSender({
    from: config.authEmailFrom,
    logger,
    resendApiKey: config.resendApiKey,
  }),
  publicAppUrl: config.publicAppUrl,
  repository: memberRepository,
});
const integrationRepository: IntegrationServiceDependencies["repository"] = {
  appendActivity: (input: Parameters<typeof appendActivityEvent>[1]) =>
    appendActivityEvent(connection.client, input),
  configure: (input: Parameters<typeof configureIntegration>[1]) =>
    configureIntegration(connection.client, input),
  connectAccountWithResource: (
    input: Parameters<typeof connectIntegrationAccountWithResource>[1],
  ) => connectIntegrationAccountWithResource(connection.client, input),
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
  listMcpTools: (workspaceId, integrationId, membershipId) =>
    listIntegrationMcpTools(
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
  replaceMcpTools: (workspaceId, integrationId, membershipId, toolNames) =>
    replaceIntegrationMcpTools(
      connection.client,
      workspaceId,
      integrationId,
      membershipId,
      toolNames,
    ),
  saveAccount: (input: Parameters<typeof saveIntegrationAccount>[1]) =>
    saveIntegrationAccount(connection.client, input),
};
const providerAccountRuntime = createProviderAccountRuntime({
  credentialEncryption,
  repository: {
    findAccount: (workspaceId, integrationId, membershipId) =>
      integrationRepository.findAccount(
        workspaceId,
        integrationId,
        membershipId,
      ),
    replaceAccountCredentials: (input, expectedEnvelope) =>
      integrationRepository.replaceAccountCredentials(input, expectedEnvelope),
  },
});
const integrationService = createIntegrationService({
  accountRuntime: providerAccountRuntime,
  adapters: integrationAdapters,
  credentialEncryption,
  oauthStateSecret: config.betterAuthSecret,
  providerRegistry,
  repository: integrationRepository,
});
const mcpToolProviders = providerModules.flatMap((providerModule) => {
  if (providerModule.createMcpToolProvider === undefined) {
    return [];
  }

  return [
    providerModule.createMcpToolProvider({
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
  ];
});
const apiRouter = Router();
apiRouter.use(
  "/workspaces",
  createWorkspaceRouter({ requireAuthentication, service: workspaceService }),
);
apiRouter.use(
  "/mcp-tokens",
  createMcpAccessRouter({
    requireAuthentication,
    service: mcpAccessService,
  }),
);
apiRouter.use(
  "/mcp-connections",
  createMcpConnectionRouter({
    requireAuthentication,
    service: mcpConnectionService,
  }),
);
apiRouter.use(
  createMemberRouter({ requireAuthentication, service: memberService }),
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
  authorizationServerMetadataHandler: createWebRequestHandler(
    oauthProviderAuthServerMetadata(authService.auth),
    config.publicAppUrl,
  ),
  authHandler: toNodeHandler(authService.auth),
  checkDatabase: () => checkDatabaseReadiness(connection),
  logger,
  mcpHandler: createMcpGateway({
    logger,
    publicAppUrl: config.publicAppUrl,
    resolveOAuthToken: (token) =>
      resolveOAuthAccessToken(connection.client, token),
    resolveToken: (tokenHash) => resolveMcpToken(connection.client, tokenHash),
    toolProviders: mcpToolProviders,
  }),
  protectedResourceMetadataHandler: createProtectedResourceMetadataHandler({
    publicAppUrl: config.publicAppUrl,
  }),
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
