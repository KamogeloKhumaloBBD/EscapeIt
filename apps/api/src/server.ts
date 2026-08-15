import {
  appendActivityEvent,
  acceptWorkspaceInvitation,
  checkDatabaseReadiness,
  clearNotificationPreferenceOverride,
  connectIntegrationAccountWithoutResource,
  connectIntegrationAccountWithResource,
  configureIntegration,
  createDatabaseConnection,
  createIntegrationBundle,
  createMcpToken,
  createNotificationChannel,
  createWorkspaceForUser,
  createWorkspaceInvitation,
  deleteIntegrationBundle,
  deleteNotificationChannel,
  disconnectIntegrationAccount,
  disconnectWorkspaceIntegration,
  ensureIntegrationAccount,
  findIntegrationAccountForMember,
  findIntegrationBundle,
  findIntegrationBundleProviderKeys,
  findIntegrationBundleSummary,
  findIntegrationByResourceExternalId,
  findIntegrationByWebhookToken,
  findNotificationChannel,
  findMemberIntegrationAccess,
  findMcpOAuthClient,
  findWorkspaceInvitationByToken,
  findCurrentWorkspaceForUser,
  findWorkspaceIntegration,
  getWorkspaceOverviewForUser,
  getWorkspaceUsageAnalytics,
  hasLiveMcpOAuthConsent,
  listIntegrationBundles,
  listIntegrationScopeExternalKeys,
  listIntegrationScopes,
  listIntegrationMcpTools,
  listMcpTokens,
  listMcpOAuthConnections,
  listNotificationChannels,
  listNotificationChannelsForWorkspace,
  listNotificationChannelSources,
  listNotificationChannelSourcesForWorkspace,
  listNotificationPreferenceOverrides,
  listPendingWorkspaceInvitations,
  listWorkspaceMembers,
  listWorkspaceMemberUsage,
  listWorkspaceToolUsage,
  listWorkspaceIntegrations,
  markIntegrationAccountValidated,
  markWorkspaceInvitationDeliveryFailed,
  markWorkspaceIntegrationValidated,
  parseNotificationEventKey,
  parseProviderKey,
  replaceIntegrationAccountCredentials,
  replaceIntegrationBundleProviders,
  replaceIntegrationMcpTools,
  replaceIntegrationScopes,
  replaceNotificationChannelSources,
  resolveMcpToken,
  resolveOAuthAccessToken,
  revokeMcpToken,
  revokeMcpOAuthConnection,
  revokeWorkspaceInvitation,
  saveIntegrationAccount,
  setOAuthConnectionBundle,
  updateIntegrationBundle,
  setIntegrationNotificationEventKeys,
  setIntegrationWebhookRegistration,
  setNotificationPreferenceOverride,
  updateNotificationChannel,
  type ProviderKey,
} from "@context-layer/db";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { Router } from "express";

import { createApp } from "./app";
import { createAuth } from "./auth";
import { parseApiConfig } from "./config/env";
import { createIntegrationBundleRouter } from "./features/integration-bundles/bundle.routes";
import {
  createIntegrationBundleService,
  type IntegrationBundleServiceDependencies,
} from "./features/integration-bundles/bundle.service";
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
import { createNotificationRouter } from "./features/notifications/notification.routes";
import {
  createNotificationService,
  type NotificationServiceDependencies,
} from "./features/notifications/notification.service";
import type { NotificationWebhookReceiverDependencies } from "./features/webhooks/notification-receiver";
import { createWebhookHandler } from "./features/webhooks/webhook.routes";
import type { WebhookReceiver } from "./features/webhooks/webhook-receiver";
import { createRequireAuthentication } from "./http/authentication";
import { createWebRequestHandler } from "./http/web-request-handler";
import type { NotificationChannelAdapter } from "./integrations/notification-channel-adapter";
import { createTeamsAdapter } from "./integrations/teams-adapter";
import { createJiraProviderModule } from "./integrations/jira";
import { jiraProvider } from "./integrations/jira/definition";
import { createJiraWebhookReceiver } from "./integrations/jira/webhook-receiver";
import { createConfluenceProviderModule } from "./integrations/confluence";
import { confluenceProvider } from "./integrations/confluence/definition";
import { createConfluenceWebhookReceiver } from "./integrations/confluence/webhook-receiver";
import { createBitbucketProviderModule } from "./integrations/bitbucket";
import { bitbucketProvider } from "./integrations/bitbucket/definition";
import { createBitbucketWebhookReceiver } from "./integrations/bitbucket/webhook-receiver";
import { createGitHubProviderModule } from "./integrations/github";
import { githubProvider } from "./integrations/github/definition";
import { createGitHubWebhookReceiver } from "./integrations/github/webhook-receiver";
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
  createBitbucketProviderModule({
    oauth: config.bitbucketOAuth,
    publicAppUrl: config.publicAppUrl,
  }),
  createGitHubProviderModule({
    app: config.githubApp,
    publicAppUrl: config.publicAppUrl,
  }),
].filter(isProviderModule);
const integrationAdapters = new Map(
  providerModules.map(
    (providerModule) =>
      [providerModule.definition.key, providerModule.adapter] as const,
  ),
);

// Teams is a notification-only provider (a webhook secret, no OAuth account
// or MCP context) so it doesn't fit the OAuth-shaped ProviderModule/
// IntegrationAdapter contract that Jira/Confluence use. It's registered
// alongside providerModules rather than inside it, with its own adapter map
// consumed only by the notification service.
//
// Teams is a notification destination (it hosts channels other providers'
// events get routed to), not a source — it has the "notification-channels"
// capability, not "notifications" (which means "declares events", the
// source side). See notification_channel_sources for the per-channel
// routing that decides which source providers a given Teams channel hears
// from.
const teamsProvider = parseProviderKey("teams");
const teamsDefinition = {
  capabilities: ["notification-channels", "webhooks"],
  description: "Send workspace notifications to a Microsoft Teams channel.",
  displayName: "Microsoft Teams",
  key: teamsProvider,
  mcpTools: [],
  notificationEvents: [],
  presentation: {},
  scopeKinds: [],
} satisfies ProviderModule["definition"];
const notificationChannelAdapters = new Map<
  ProviderKey,
  NotificationChannelAdapter
>([[teamsProvider, createTeamsAdapter()]]);

// Every notification receiver shares the same channel-delivery dependencies;
// only how it identifies the workspace differs.
const notificationDependencies: NotificationWebhookReceiverDependencies = {
  credentialEncryption,
  database: connection.client,
  listNotificationChannels: (workspaceId) =>
    listNotificationChannelsForWorkspace(connection.client, workspaceId),
  listNotificationChannelSources: (workspaceId) =>
    listNotificationChannelSourcesForWorkspace(connection.client, workspaceId),
  notificationChannelAdapters,
};

function findIntegrationByToken(provider: ProviderKey) {
  return async (token: string) => {
    const integration = await findIntegrationByWebhookToken(
      connection.client,
      provider,
      token,
    );

    return integration === null
      ? null
      : {
          notificationEventKeys: integration.notificationEventKeys,
          workspaceId: integration.workspaceId,
        };
  };
}

const webhookReceivers = new Map<ProviderKey, WebhookReceiver>(
  [
    createBitbucketWebhookReceiver({
      ...notificationDependencies,
      findIntegrationByToken: findIntegrationByToken(bitbucketProvider),
    }),
    createConfluenceWebhookReceiver({
      ...notificationDependencies,
      findIntegrationByCloudId: async (cloudId) => {
        const integration = await findIntegrationByResourceExternalId(
          connection.client,
          confluenceProvider,
          cloudId,
        );

        if (integration === null) {
          return null;
        }

        return {
          notificationEventKeys: integration.notificationEventKeys,
          selectedSpaceKeys: await listIntegrationScopeExternalKeys(
            connection.client,
            integration.id,
          ),
          workspaceId: integration.workspaceId,
        };
      },
      forgeAppId: config.forgeAppId,
    }),
    createGitHubWebhookReceiver({
      ...notificationDependencies,
      findIntegrationByInstallationId: async (installationId) => {
        const integration = await findIntegrationByResourceExternalId(
          connection.client,
          githubProvider,
          installationId,
        );

        if (integration === null) {
          return null;
        }

        return {
          notificationEventKeys: integration.notificationEventKeys,
          selectedRepositoryFullNames: await listIntegrationScopeExternalKeys(
            connection.client,
            integration.id,
          ),
          workspaceId: integration.workspaceId,
        };
      },
      webhookSecret: config.githubApp?.webhookSecret ?? null,
    }),
    createJiraWebhookReceiver({
      ...notificationDependencies,
      findIntegrationByToken: findIntegrationByToken(jiraProvider),
    }),
  ].map((receiver) => [receiver.provider, receiver]),
);
const webhookHandler = createWebhookHandler({ receivers: webhookReceivers });

const providerRegistry = createProviderRegistry([
  ...providerModules.map((providerModule) => providerModule.definition),
  teamsDefinition,
]);
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
  findBundleSummary: (workspaceId, bundleId) =>
    findIntegrationBundleSummary(connection.client, workspaceId, bundleId),
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
  findCurrentWorkspace: (userId) =>
    findCurrentWorkspaceForUser(connection.client, userId),
  hasLiveConsent: (userId, clientId, referenceId) =>
    hasLiveMcpOAuthConsent(connection.client, userId, clientId, referenceId),
  listConnections: (userId) =>
    listMcpOAuthConnections(connection.client, userId),
  revokeConnection: (userId, consentId) =>
    revokeMcpOAuthConnection(connection.client, userId, consentId),
  setConnectionBundle: (clientId, userId, referenceId, bundleId) =>
    setOAuthConnectionBundle(connection.client, {
      bundleId,
      clientId,
      referenceId,
      userId,
    }),
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
  connectAccountWithoutResource: (
    input: Parameters<typeof connectIntegrationAccountWithoutResource>[1],
  ) => connectIntegrationAccountWithoutResource(connection.client, input),
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
  registerWebhook: async (
    workspaceId,
    integrationId,
    webhookToken,
    webhookRegistrationId,
  ) => {
    await setIntegrationWebhookRegistration(
      connection.client,
      workspaceId,
      integrationId,
      webhookToken,
      webhookRegistrationId,
    );
  },
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
  setNotificationEventKeys: (
    workspaceId,
    integrationId,
    ownerMembershipId,
    eventKeys,
  ) =>
    setIntegrationNotificationEventKeys(
      connection.client,
      workspaceId,
      integrationId,
      ownerMembershipId,
      eventKeys,
    ),
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
  listNotificationChannels: (workspaceId) =>
    listNotificationChannelsForWorkspace(connection.client, workspaceId),
  notificationSetupUrl: config.forgeAppInstallUrl,
  oauthStateSecret: config.betterAuthSecret,
  providerRegistry,
  repository: integrationRepository,
  webhookPublicUrl: config.webhookPublicUrl,
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
  listChannelSources: (workspaceId, channelId) =>
    listNotificationChannelSources(connection.client, workspaceId, channelId),
  listPreferenceOverrides: (workspaceId, membershipId) =>
    listNotificationPreferenceOverrides(
      connection.client,
      workspaceId,
      membershipId,
    ),
  replaceChannelSources: (
    workspaceId,
    channelId,
    ownerMembershipId,
    providers,
  ) =>
    replaceNotificationChannelSources(
      connection.client,
      workspaceId,
      channelId,
      ownerMembershipId,
      providers,
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
const integrationBundleRepository: IntegrationBundleServiceDependencies["repository"] =
  {
    create: (input) => createIntegrationBundle(connection.client, input),
    delete: (workspaceId, bundleId, ownerMembershipId) =>
      deleteIntegrationBundle(
        connection.client,
        workspaceId,
        bundleId,
        ownerMembershipId,
      ),
    findCurrentWorkspace: (userId) =>
      findCurrentWorkspaceForUser(connection.client, userId),
    get: (workspaceId, bundleId, membershipId) =>
      findIntegrationBundle(
        connection.client,
        workspaceId,
        bundleId,
        membershipId,
      ),
    list: (workspaceId, membershipId) =>
      listIntegrationBundles(connection.client, workspaceId, membershipId),
    replaceProviders: (workspaceId, bundleId, ownerMembershipId, providers) =>
      replaceIntegrationBundleProviders(
        connection.client,
        workspaceId,
        bundleId,
        ownerMembershipId,
        providers,
      ),
    update: (workspaceId, bundleId, ownerMembershipId, input) =>
      updateIntegrationBundle(
        connection.client,
        workspaceId,
        bundleId,
        ownerMembershipId,
        input,
      ),
  };
const integrationBundleService = createIntegrationBundleService({
  providerRegistry,
  repository: integrationBundleRepository,
});
const mcpToolProviders = providerModules.flatMap((providerModule) => {
  if (providerModule.createMcpToolProvider === undefined) {
    return [];
  }

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
apiRouter.use(
  "/integration-bundles",
  createIntegrationBundleRouter({
    requireAuthentication,
    service: integrationBundleService,
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
    resolveBundleProviderKeys: async (workspaceId, bundleId) =>
      new Set(
        await findIntegrationBundleProviderKeys(
          connection.client,
          workspaceId,
          bundleId,
        ),
      ),
    resolveOAuthToken: (token) =>
      resolveOAuthAccessToken(connection.client, token),
    resolveToken: (tokenHash) => resolveMcpToken(connection.client, tokenHash),
    toolProviders: mcpToolProviders,
  }),
  protectedResourceMetadataHandler: createProtectedResourceMetadataHandler({
    publicAppUrl: config.publicAppUrl,
  }),
  webhookHandler,
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
