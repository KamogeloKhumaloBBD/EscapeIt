import {
  appendActivityEvent,
  acceptWorkspaceInvitation,
  checkDatabaseReadiness,
  clearNotificationPreferenceOverride,
  configureIntegration,
  createDatabaseConnection,
  createMcpToken,
  createNotificationChannel,
  createWorkspaceForUser,
  createWorkspaceInvitation,
  deleteNotificationChannel,
  disconnectIntegrationAccount,
  disconnectWorkspaceIntegration,
  ensureIntegrationAccount,
  findIntegrationAccountForMember,
  findNotificationChannel,
  findWorkspaceInvitationByToken,
  findCurrentWorkspaceForUser,
  findWorkspaceIntegration,
  getWorkspaceOverviewForUser,
  listIntegrationScopes,
  listMcpTokens,
  listNotificationChannels,
  listNotificationPreferenceOverrides,
  listPendingWorkspaceInvitations,
  listWorkspaceMembers,
  listWorkspaceIntegrations,
  markIntegrationAccountValidated,
  markWorkspaceInvitationDeliveryFailed,
  markWorkspaceIntegrationValidated,
  parseNotificationEventKey,
  parseProviderKey,
  parseScopeKey,
  replaceIntegrationAccountCredentials,
  replaceIntegrationScopes,
  resolveMcpToken,
  revokeMcpToken,
  revokeWorkspaceInvitation,
  saveIntegrationAccount,
  setNotificationPreferenceOverride,
  updateNotificationChannel,
  type ProviderKey,
} from "@context-layer/db";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
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
import { createInvitationEmailSender } from "./features/members/invitation-email";
import { createMemberRouter } from "./features/members/member.routes";
import {
  createMemberService,
  type MemberServiceDependencies,
} from "./features/members/member.service";
import { createNotificationRouter } from "./features/notifications/notification.routes";
import {
  createNotificationService,
  type NotificationServiceDependencies,
} from "./features/notifications/notification.service";
import { createRequireAuthentication } from "./http/authentication";
import { createJiraAdapter } from "./integrations/jira-adapter";
import type { NotificationChannelAdapter } from "./integrations/notification-channel-adapter";
import { createTeamsAdapter } from "./integrations/teams-adapter";
import { createLogger } from "./logging";
import {
  createProviderRegistry,
  type ProviderDefinition,
} from "./integrations/provider-registry";
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

// Teams channels are dispatched manually today (a "Send test message" action
// only) — no domain event relays into a channel yet. These two events exist
// so the registry has something to validate/list against; wire real Jira
// event relaying into `notificationService` here once that's built.
const teamsProvider = parseProviderKey("teams");
providerDefinitions.push({
  capabilities: ["notifications", "webhooks"],
  description: "Send workspace notifications to a Microsoft Teams channel.",
  displayName: "Microsoft Teams",
  key: teamsProvider,
  notificationEvents: [
    {
      defaultEnabled: true,
      displayName: "Integration disconnected",
      key: parseNotificationEventKey("teams.integration-disconnected"),
    },
    {
      defaultEnabled: true,
      displayName: "Integration connection error",
      key: parseNotificationEventKey("teams.integration-error"),
    },
  ],
  scopeKinds: [],
});
const notificationChannelAdapters = new Map<
  ProviderKey,
  NotificationChannelAdapter
>([[teamsProvider, createTeamsAdapter()]]);

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
const notificationRepository: NotificationServiceDependencies["repository"] = {
  appendActivity: (input: Parameters<typeof appendActivityEvent>[1]) =>
    appendActivityEvent(connection.client, input),
  clearPreferenceOverride: (workspaceId, membershipId, eventKey) =>
    clearNotificationPreferenceOverride(
      connection.client,
      workspaceId,
      membershipId,
      parseNotificationEventKey(eventKey),
    ),
  createChannel: (input: Parameters<typeof createNotificationChannel>[1]) =>
    createNotificationChannel(connection.client, input),
  deleteChannel: (workspaceId, channelId, membershipId) =>
    deleteNotificationChannel(
      connection.client,
      workspaceId,
      channelId,
      membershipId,
    ),
  findChannel: (workspaceId, channelId) =>
    findNotificationChannel(connection.client, workspaceId, channelId),
  findCurrentWorkspace: (userId: string) =>
    findCurrentWorkspaceForUser(connection.client, userId),
  listChannels: (workspaceId, membershipId) =>
    listNotificationChannels(connection.client, workspaceId, membershipId),
  listPreferenceOverrides: (workspaceId, membershipId) =>
    listNotificationPreferenceOverrides(
      connection.client,
      workspaceId,
      membershipId,
    ),
  setPreferenceOverride: (workspaceId, membershipId, eventKey, enabled) =>
    setNotificationPreferenceOverride(
      connection.client,
      workspaceId,
      membershipId,
      parseNotificationEventKey(eventKey),
      enabled,
    ),
  updateChannel: (input: Parameters<typeof updateNotificationChannel>[1]) =>
    updateNotificationChannel(connection.client, input),
};
const notificationService = createNotificationService({
  adapters: notificationChannelAdapters,
  credentialEncryption,
  providerRegistry,
  repository: notificationRepository,
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
apiRouter.use(
  "/notifications",
  createNotificationRouter({
    requireAuthentication,
    service: notificationService,
  }),
);
const app = createApp({
  allowedOrigin: config.publicAppUrl,
  apiRouter,
  authHandler: toNodeHandler(authService.auth),
  checkDatabase: () => checkDatabaseReadiness(connection),
  logger,
  mcpHandler: createMcpGateway({
    logger,
    publicAppUrl: config.publicAppUrl,
    resolveToken: (tokenHash) => resolveMcpToken(connection.client, tokenHash),
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
