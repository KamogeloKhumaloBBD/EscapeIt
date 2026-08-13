import {
  InvalidIntegrationKeyError,
  parseProviderKey,
  type AppendActivityEventInput,
  type ConnectIntegrationAccountWithResourceInput,
  type CurrentWorkspace,
  type EncryptedCredentialEnvelope,
  type Integration,
  type IntegrationAccount,
  type IntegrationConnectionContext,
  type IntegrationMcpTool,
  type IntegrationScope,
  type NotificationChannel,
  type NotificationEventKey,
  type ProviderKey,
  type SaveIntegrationAccountInput,
  type SelectedIntegrationScopeInput,
} from "@context-layer/db";
import { z } from "zod";

import { HttpError } from "../../errors";
import type { CredentialEncryption } from "../../security/credential-encryption";
import {
  ProviderAdapterError,
  type IntegrationAdapter,
  type OAuthCredentials,
  type ProviderResource,
} from "../../integrations/integration-adapter";
import { createOAuthState } from "../../integrations/oauth-state";
import {
  ProviderAccountRuntimeError,
  type ProviderAccountRuntime,
} from "../../integrations/provider-account-runtime";
import type { ProviderRegistry } from "../../integrations/provider-registry";
import type {
  IntegrationDetailContract,
  IntegrationMcpToolContract,
  IntegrationNotificationEventContract,
  IntegrationResourceContract,
  IntegrationScopeContract,
  IntegrationSummaryContract,
  ScopeDiscoveryContract,
} from "./integration.contracts";

const resourceSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  url: z.url(),
});

interface IntegrationRepository {
  appendActivity(input: AppendActivityEventInput): Promise<unknown>;
  configure(input: {
    clearScopes?: boolean;
    configuration: Record<string, string>;
    configuredByMembershipId: string;
    lastValidatedAt: Date;
    provider: ProviderKey;
    status: "connected";
    workspaceId: string;
  }): Promise<Integration>;
  connectAccountWithResource(
    input: ConnectIntegrationAccountWithResourceInput,
  ): Promise<IntegrationConnectionContext>;
  disconnectAccount(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
  ): Promise<boolean>;
  disconnectInstallation(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
  ): Promise<boolean>;
  ensureAccount(
    workspaceId: string,
    membershipId: string,
    provider: ProviderKey,
  ): Promise<IntegrationConnectionContext>;
  findAccount(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
  ): Promise<IntegrationAccount | null>;
  findCurrentWorkspace(userId: string): Promise<CurrentWorkspace | null>;
  findIntegration(
    workspaceId: string,
    membershipId: string,
    provider: ProviderKey,
  ): Promise<Integration | null>;
  listIntegrations(
    workspaceId: string,
    membershipId: string,
  ): Promise<Integration[]>;
  listScopes(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
  ): Promise<IntegrationScope[]>;
  listMcpTools(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
  ): Promise<IntegrationMcpTool[]>;
  markAccountValidated(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
  ): Promise<void>;
  markInstallationValidated(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
  ): Promise<void>;
  replaceAccountCredentials(
    input: SaveIntegrationAccountInput,
    expectedEnvelope: EncryptedCredentialEnvelope,
  ): Promise<IntegrationAccount | null>;
  replaceScopes(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
    scopes: readonly SelectedIntegrationScopeInput[],
  ): Promise<IntegrationScope[]>;
  replaceMcpTools(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
    toolNames: readonly string[],
  ): Promise<IntegrationMcpTool[]>;
  registerWebhook(
    workspaceId: string,
    integrationId: string,
    webhookToken: string,
    webhookRegistrationId: string | null,
  ): Promise<void>;
  saveAccount(input: SaveIntegrationAccountInput): Promise<IntegrationAccount>;
  setNotificationEventKeys(
    workspaceId: string,
    integrationId: string,
    ownerMembershipId: string,
    eventKeys: readonly NotificationEventKey[],
  ): Promise<Integration>;
}

export interface IntegrationServiceDependencies {
  accountRuntime: ProviderAccountRuntime;
  adapters: ReadonlyMap<ProviderKey, IntegrationAdapter>;
  credentialEncryption: CredentialEncryption;
  listNotificationChannels: (
    workspaceId: string,
  ) => Promise<NotificationChannel[]>;
  oauthStateSecret: string;
  providerRegistry: ProviderRegistry;
  repository: IntegrationRepository;
  webhookPublicUrl: string;
}

function providerFromInput(
  value: string,
  registry: ProviderRegistry,
): ProviderKey {
  try {
    const key = parseProviderKey(value);

    if (registry.get(key) === undefined) {
      throw new HttpError(
        404,
        "PROVIDER_NOT_FOUND",
        "The integration provider is unavailable.",
      );
    }

    return key;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof InvalidIntegrationKeyError) {
      throw new HttpError(
        404,
        "PROVIDER_NOT_FOUND",
        "The integration provider is unavailable.",
      );
    }

    throw error;
  }
}

function mapProviderError(error: unknown): never {
  if (error instanceof ProviderAccountRuntimeError) {
    if (error.code === "account_required") {
      throw new HttpError(
        409,
        "PROVIDER_ACCOUNT_REQUIRED",
        "Connect your provider account first.",
      );
    }

    throw new HttpError(
      500,
      "CREDENTIALS_UNAVAILABLE",
      "The stored provider credentials could not be read.",
    );
  }

  if (error instanceof ProviderAdapterError) {
    const mapping = {
      authorization_expired: [
        409,
        "PROVIDER_AUTHORIZATION_EXPIRED",
        "Reconnect your provider account and try again.",
      ],
      content_too_large: [
        413,
        "PROVIDER_CONTENT_TOO_LARGE",
        "The provider content exceeds the supported size.",
      ],
      forbidden: [
        403,
        "PROVIDER_PERMISSION_REQUIRED",
        "Your provider account does not permit this operation.",
      ],
      inaccessible_resource: [
        409,
        "PROVIDER_RESOURCE_UNAVAILABLE",
        "The selected provider resource is unavailable.",
      ],
      invalid_request: [
        400,
        "PROVIDER_REQUEST_REJECTED",
        "The provider rejected the requested operation.",
      ],
      invalid_response: [
        503,
        "PROVIDER_INVALID_RESPONSE",
        "The provider returned an unexpected response.",
      ],
      not_found: [
        404,
        "PROVIDER_RESOURCE_NOT_FOUND",
        "The provider resource was not found.",
      ],
      temporarily_unavailable: [
        503,
        "PROVIDER_UNAVAILABLE",
        "The provider is temporarily unavailable.",
      ],
      unsupported_content: [
        415,
        "PROVIDER_CONTENT_UNSUPPORTED",
        "The provider content type is unsupported.",
      ],
    } as const;
    const [status, code, message] = mapping[error.code];
    throw new HttpError(status, code, message);
  }

  throw error;
}

function requireWorkspace(current: CurrentWorkspace | null): CurrentWorkspace {
  if (current === null) {
    throw new HttpError(
      404,
      "WORKSPACE_NOT_FOUND",
      "The user does not belong to a workspace.",
    );
  }

  return current;
}

function adapterFor(
  provider: ProviderKey,
  adapters: ReadonlyMap<ProviderKey, IntegrationAdapter>,
): IntegrationAdapter {
  const adapter = adapters.get(provider);

  if (adapter === undefined) {
    throw new HttpError(
      503,
      "PROVIDER_UNAVAILABLE",
      "The integration provider is not configured for this deployment.",
    );
  }

  return adapter;
}

function readResource(integration: Integration): ProviderResource | null {
  const parsed = resourceSchema.safeParse(integration.configuration);
  return parsed.success ? parsed.data : null;
}

function toResourceContract(
  resource: ProviderResource | null,
): IntegrationResourceContract | null {
  return resource === null ? null : { ...resource };
}

function toScopeContract(scope: IntegrationScope): IntegrationScopeContract {
  return {
    displayName: scope.displayName,
    externalId: scope.externalId,
    scopeKey: scope.scopeKey,
  };
}

function enabledMcpToolNames(
  definition: ReturnType<ProviderRegistry["require"]>,
  selected: readonly IntegrationMcpTool[],
): Set<string> {
  const available = new Set(definition.mcpTools.map((tool) => tool.name));
  return new Set(
    selected.map((tool) => tool.toolName).filter((name) => available.has(name)),
  );
}

function toMcpToolContracts(
  definition: ReturnType<ProviderRegistry["require"]>,
  selected: readonly IntegrationMcpTool[],
): IntegrationMcpToolContract[] {
  const enabled = enabledMcpToolNames(definition, selected);
  return definition.mcpTools.map((tool) => ({
    ...tool,
    enabled: enabled.has(tool.name),
  }));
}

function toNotificationEventContracts(
  definition: ReturnType<ProviderRegistry["require"]>,
  integration: Integration | null,
): IntegrationNotificationEventContract[] {
  const enabledKeys = new Set(integration?.notificationEventKeys ?? []);
  return definition.notificationEvents.map((event) => ({
    displayName: event.displayName,
    enabled: enabledKeys.has(event.key),
    key: event.key,
  }));
}

function buildSummary(
  definition: ReturnType<ProviderRegistry["require"]>,
  role: CurrentWorkspace["membership"]["role"],
  integration: Integration | null,
  account: IntegrationAccount | null,
  scopes: readonly IntegrationScope[],
  selectedMcpTools: readonly IntegrationMcpTool[],
  connectedChannelCount: number,
): IntegrationSummaryContract {
  const resource = integration === null ? null : readResource(integration);
  const isOwner = role === "owner";
  const enabledToolCount = enabledMcpToolNames(
    definition,
    selectedMcpTools,
  ).size;
  const hasAccount = definition.capabilities.includes("user-accounts");
  const hasResource = definition.presentation.resourceLabel !== undefined;
  const hasScopes = definition.capabilities.includes("scopes");
  const hasMcpTools = definition.capabilities.includes("context");
  const hasNotificationChannels = definition.capabilities.includes(
    "notification-channels",
  );
  const isInstallationConnected = integration?.status === "connected";
  let nextStep: IntegrationSummaryContract["nextStep"];

  if (hasNotificationChannels) {
    nextStep =
      connectedChannelCount > 0
        ? "ready"
        : isOwner
          ? "connect_provider"
          : "wait_for_owner";
  } else if (integration === null) {
    nextStep = isOwner ? "connect_provider" : "wait_for_owner";
  } else if (
    definition.resourceSelection === "authorization" &&
    !isInstallationConnected
  ) {
    nextStep = isOwner ? "connect_provider" : "wait_for_owner";
  } else if (hasAccount && account?.status !== "connected") {
    nextStep = "connect_account";
  } else if (
    hasResource &&
    (resource === null || integration.status !== "connected")
  ) {
    nextStep = isOwner
      ? definition.resourceSelection === "authorization"
        ? "connect_provider"
        : "select_resource"
      : "wait_for_owner";
  } else if (hasScopes && scopes.length === 0) {
    nextStep = isOwner ? "select_scopes" : "wait_for_owner";
  } else if (hasMcpTools && enabledToolCount === 0) {
    nextStep = isOwner ? "select_tools" : "wait_for_owner";
  } else {
    nextStep = "ready";
  }

  return {
    attention:
      integration?.status === "error" || account?.status === "error"
        ? "This connection needs attention."
        : null,
    capabilities: definition.capabilities,
    currentAccount:
      account === null
        ? null
        : {
            displayName: account.externalDisplayName,
            lastValidatedAt: account.lastValidatedAt?.toISOString() ?? null,
            status: account.status,
          },
    description: definition.description,
    displayName: definition.displayName,
    installation:
      integration === null
        ? null
        : {
            enabledMcpToolCount: enabledToolCount,
            lastValidatedAt: integration.lastValidatedAt?.toISOString() ?? null,
            resource: toResourceContract(resource),
            selectedScopeCount: scopes.length,
            status: integration.status,
          },
    nextStep,
    permissions: {
      canConnectAccount: hasAccount && (integration !== null || isOwner),
      canManageInstallation: isOwner,
      canManageMcpTools: hasMcpTools && isOwner && isInstallationConnected,
      canManageNotifications:
        definition.capabilities.includes("notifications") && isOwner,
      canManageScopes:
        hasScopes &&
        isOwner &&
        isInstallationConnected &&
        (!hasResource || resource !== null),
    },
    presentation: definition.presentation,
    provider: definition.key,
    ...(definition.resourceSelection === undefined
      ? {}
      : { resourceSelection: definition.resourceSelection }),
  };
}

export function createIntegrationService({
  accountRuntime,
  adapters,
  credentialEncryption,
  listNotificationChannels,
  oauthStateSecret,
  providerRegistry,
  repository,
  webhookPublicUrl,
}: IntegrationServiceDependencies) {
  async function current(userId: string) {
    return requireWorkspace(await repository.findCurrentWorkspace(userId));
  }

  async function appendActivity(
    workspace: CurrentWorkspace,
    correlationId: string,
    provider: ProviderKey,
    operation: string,
    summary: string,
  ) {
    await repository.appendActivity({
      actorMembershipId: workspace.membership.id,
      category: "integration",
      correlationId,
      operation,
      provider,
      status: "succeeded",
      summary,
      workspaceId: workspace.workspace.id,
    });
  }

  async function withCredentials<T>(
    workspace: CurrentWorkspace,
    integration: Integration,
    account: IntegrationAccount,
    adapter: IntegrationAdapter,
    operation: (credentials: OAuthCredentials) => Promise<T>,
  ): Promise<T> {
    return accountRuntime.withCredentials(
      {
        account,
        integration,
        membershipId: workspace.membership.id,
        workspaceId: workspace.workspace.id,
      },
      adapter,
      operation,
    );
  }

  async function countConnectedChannels(
    workspaceId: string,
    provider: ProviderKey,
  ): Promise<number> {
    const channels = await listNotificationChannels(workspaceId);
    return channels.filter((channel) => channel.provider === provider).length;
  }

  async function detailFor(
    workspace: CurrentWorkspace,
    provider: ProviderKey,
  ): Promise<IntegrationDetailContract> {
    const definition = providerRegistry.require(provider);
    const integration = await repository.findIntegration(
      workspace.workspace.id,
      workspace.membership.id,
      provider,
    );
    const account =
      integration === null
        ? null
        : await repository.findAccount(
            workspace.workspace.id,
            integration.id,
            workspace.membership.id,
          );
    const [scopes, selectedMcpTools, connectedChannelCount] =
      integration === null
        ? [
            [],
            [],
            definition.capabilities.includes("notification-channels")
              ? await countConnectedChannels(workspace.workspace.id, provider)
              : 0,
          ]
        : await Promise.all([
            repository.listScopes(
              workspace.workspace.id,
              integration.id,
              workspace.membership.id,
            ),
            repository.listMcpTools(
              workspace.workspace.id,
              integration.id,
              workspace.membership.id,
            ),
            definition.capabilities.includes("notification-channels")
              ? countConnectedChannels(workspace.workspace.id, provider)
              : 0,
          ]);

    return {
      ...buildSummary(
        definition,
        workspace.membership.role,
        integration,
        account,
        scopes,
        selectedMcpTools,
        connectedChannelCount,
      ),
      mcpTools: toMcpToolContracts(definition, selectedMcpTools),
      notificationEvents: toNotificationEventContracts(definition, integration),
      selectedScopes: scopes.map(toScopeContract),
    };
  }

  async function accountContext(
    workspace: CurrentWorkspace,
    provider: ProviderKey,
    requireConnectedInstallation = false,
  ) {
    const integration = await repository.findIntegration(
      workspace.workspace.id,
      workspace.membership.id,
      provider,
    );

    if (integration === null) {
      throw new HttpError(
        409,
        "INTEGRATION_REQUIRED",
        "The workspace integration must be installed first.",
      );
    }

    if (requireConnectedInstallation && integration.status !== "connected") {
      throw new HttpError(
        409,
        "INTEGRATION_NOT_CONNECTED",
        "Connect the workspace integration first.",
      );
    }

    const account = await repository.findAccount(
      workspace.workspace.id,
      integration.id,
      workspace.membership.id,
    );

    if (account?.status !== "connected") {
      throw new HttpError(
        409,
        "PROVIDER_ACCOUNT_REQUIRED",
        "Connect your provider account first.",
      );
    }

    return { account, integration };
  }

  return {
    async beginOAuth(userId: string, providerValue: string) {
      const workspace = await current(userId);
      const provider = providerFromInput(providerValue, providerRegistry);
      const adapter = adapterFor(provider, adapters);
      const context = await repository.ensureAccount(
        workspace.workspace.id,
        workspace.membership.id,
        provider,
      );

      if (
        workspace.membership.role !== "owner" &&
        (context.integration.status !== "connected" ||
          readResource(context.integration) === null)
      ) {
        throw new HttpError(
          403,
          "INTEGRATION_NOT_READY",
          "The workspace owner must finish configuring this integration.",
        );
      }
      const state = createOAuthState(
        oauthStateSecret,
        workspace.membership.id,
        provider,
      );

      return {
        authorizationUrl: adapter.buildAuthorizationUrl(state),
        context,
        state,
      };
    },

    async completeOAuth(
      userId: string,
      providerValue: string,
      code: string,
      stateMembershipId: string,
      correlationId: string,
    ) {
      const workspace = await current(userId);
      const provider = providerFromInput(providerValue, providerRegistry);

      if (
        workspace.membership.id !== stateMembershipId ||
        workspace.membership.userId !== userId
      ) {
        throw new HttpError(
          400,
          "OAUTH_STATE_INVALID",
          "The authorization request is no longer valid.",
        );
      }

      const adapter = adapterFor(provider, adapters);
      const definition = providerRegistry.require(provider);
      const context = await repository.ensureAccount(
        workspace.workspace.id,
        workspace.membership.id,
        provider,
      );

      try {
        const credentials = await adapter.exchangeAuthorizationCode(code);
        const [identity, resources] = await Promise.all([
          adapter.getIdentity(credentials),
          adapter.discoverResources(credentials),
        ]);
        const configuredResource = readResource(context.integration);
        const authorizationResource =
          configuredResource === null &&
          definition.resourceSelection === "authorization"
            ? resources[0]
            : null;

        if (
          configuredResource === null &&
          definition.resourceSelection === "authorization" &&
          (workspace.membership.role !== "owner" || resources.length !== 1)
        ) {
          throw new ProviderAdapterError("invalid_response");
        }

        if (
          configuredResource !== null &&
          !resources.some(
            (resource) => resource.externalId === configuredResource.externalId,
          )
        ) {
          throw new ProviderAdapterError("inaccessible_resource");
        }

        const envelope = credentialEncryption.encrypt(
          credentials,
          "integration-account",
          context.account.id,
        );
        const accountInput: SaveIntegrationAccountInput = {
          accountId: context.account.id,
          credentialEnvelope: envelope,
          externalAccountId: identity.externalAccountId,
          externalDisplayName: identity.displayName,
          integrationId: context.integration.id,
          lastValidatedAt: new Date(),
          membershipId: workspace.membership.id,
          status: "connected",
          workspaceId: workspace.workspace.id,
        };

        if (authorizationResource === null) {
          await repository.saveAccount(accountInput);
        } else {
          await repository.connectAccountWithResource({
            account: accountInput,
            installation: {
              configuration: { ...authorizationResource },
              configuredByMembershipId: workspace.membership.id,
              lastValidatedAt: new Date(),
              provider,
              status: "connected",
              workspaceId: workspace.workspace.id,
            },
          });
        }

        await appendActivity(
          workspace,
          correlationId,
          provider,
          "integration.account.connect",
          `${providerRegistry.require(provider).displayName} account connected`,
        );

        return { resources };
      } catch (error) {
        mapProviderError(error);
      }
    },

    async disconnectAccount(
      userId: string,
      providerValue: string,
      correlationId: string,
    ) {
      const workspace = await current(userId);
      const provider = providerFromInput(providerValue, providerRegistry);
      const integration = await repository.findIntegration(
        workspace.workspace.id,
        workspace.membership.id,
        provider,
      );

      if (integration === null) {
        throw new HttpError(
          404,
          "INTEGRATION_NOT_FOUND",
          "Integration not found.",
        );
      }

      await repository.disconnectAccount(
        workspace.workspace.id,
        integration.id,
        workspace.membership.id,
      );
      await appendActivity(
        workspace,
        correlationId,
        provider,
        "integration.account.disconnect",
        `${providerRegistry.require(provider).displayName} account disconnected`,
      );
    },

    async disconnectInstallation(
      userId: string,
      providerValue: string,
      correlationId: string,
    ) {
      const workspace = await current(userId);
      const provider = providerFromInput(providerValue, providerRegistry);
      const integration = await repository.findIntegration(
        workspace.workspace.id,
        workspace.membership.id,
        provider,
      );

      if (integration === null) {
        throw new HttpError(
          404,
          "INTEGRATION_NOT_FOUND",
          "Integration not found.",
        );
      }

      const disconnected = await repository.disconnectInstallation(
        workspace.workspace.id,
        integration.id,
        workspace.membership.id,
      );

      if (!disconnected) {
        throw new HttpError(
          404,
          "INTEGRATION_NOT_FOUND",
          "Integration not found.",
        );
      }

      await appendActivity(
        workspace,
        correlationId,
        provider,
        "integration.disconnect",
        `${providerRegistry.require(provider).displayName} disconnected`,
      );
    },

    async discoverResources(userId: string, providerValue: string) {
      const workspace = await current(userId);
      const provider = providerFromInput(providerValue, providerRegistry);
      const definition = providerRegistry.require(provider);

      if (definition.resourceSelection !== "application") {
        throw new HttpError(
          409,
          "RESOURCE_SELECTED_DURING_AUTHORIZATION",
          "This provider selects its workspace resource during authorization.",
        );
      }

      const adapter = adapterFor(provider, adapters);
      const { account, integration } = await accountContext(
        workspace,
        provider,
      );

      try {
        return await withCredentials(
          workspace,
          integration,
          account,
          adapter,
          (credentials) => adapter.discoverResources(credentials),
        );
      } catch (error) {
        mapProviderError(error);
      }
    },

    async discoverScopes(
      userId: string,
      providerValue: string,
      query: string,
      cursor: string | null,
    ): Promise<ScopeDiscoveryContract> {
      const workspace = await current(userId);

      if (workspace.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Workspace owner access is required.",
        );
      }

      const provider = providerFromInput(providerValue, providerRegistry);
      const adapter = adapterFor(provider, adapters);
      const { account, integration } = await accountContext(
        workspace,
        provider,
        true,
      );
      const resource = readResource(integration);

      if (resource === null) {
        throw new HttpError(
          409,
          "INTEGRATION_SITE_REQUIRED",
          "Select a workspace resource first.",
        );
      }

      try {
        const page = await withCredentials(
          workspace,
          integration,
          account,
          adapter,
          (credentials) =>
            adapter.discoverScopes(credentials, resource, query, cursor),
        );
        return {
          items: page.items.map((scope) => ({ ...scope })),
          nextCursor: page.nextCursor,
        };
      } catch (error) {
        mapProviderError(error);
      }
    },

    async getDetail(userId: string, providerValue: string) {
      const workspace = await current(userId);
      const provider = providerFromInput(providerValue, providerRegistry);
      return detailFor(workspace, provider);
    },

    async list(userId: string): Promise<readonly IntegrationSummaryContract[]> {
      const workspace = await current(userId);
      const [installed, channels] = await Promise.all([
        repository.listIntegrations(
          workspace.workspace.id,
          workspace.membership.id,
        ),
        listNotificationChannels(workspace.workspace.id),
      ]);
      const installedByProvider = new Map(
        installed.map((integration) => [integration.provider, integration]),
      );
      const channelCountByProvider = new Map<ProviderKey, number>();
      for (const channel of channels) {
        channelCountByProvider.set(
          channel.provider,
          (channelCountByProvider.get(channel.provider) ?? 0) + 1,
        );
      }

      return Promise.all(
        providerRegistry.list().map(async (definition) => {
          const integration = installedByProvider.get(definition.key) ?? null;
          const account =
            integration === null
              ? null
              : await repository.findAccount(
                  workspace.workspace.id,
                  integration.id,
                  workspace.membership.id,
                );
          const [scopes, selectedMcpTools] =
            integration === null
              ? ([[], []] as const)
              : await Promise.all([
                  repository.listScopes(
                    workspace.workspace.id,
                    integration.id,
                    workspace.membership.id,
                  ),
                  repository.listMcpTools(
                    workspace.workspace.id,
                    integration.id,
                    workspace.membership.id,
                  ),
                ]);
          return buildSummary(
            definition,
            workspace.membership.role,
            integration,
            account,
            scopes,
            selectedMcpTools,
            channelCountByProvider.get(definition.key) ?? 0,
          );
        }),
      );
    },

    async replaceScopes(
      userId: string,
      providerValue: string,
      externalIds: readonly string[],
      correlationId: string,
    ) {
      const workspace = await current(userId);

      if (workspace.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Workspace owner access is required.",
        );
      }

      if (new Set(externalIds).size !== externalIds.length) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "Duplicate scope selection.",
        );
      }

      const provider = providerFromInput(providerValue, providerRegistry);
      const adapter = adapterFor(provider, adapters);
      const { account, integration } = await accountContext(
        workspace,
        provider,
        true,
      );
      const resource = readResource(integration);

      if (resource === null) {
        throw new HttpError(
          409,
          "INTEGRATION_SITE_REQUIRED",
          "Select a workspace resource first.",
        );
      }

      try {
        const resolved = await withCredentials(
          workspace,
          integration,
          account,
          adapter,
          async (credentials) => {
            const scopes = await adapter.resolveScopes(
              credentials,
              resource,
              externalIds,
            );

            if (adapter.registerWebhooks !== undefined) {
              const webhookToken =
                integration.webhookToken ?? crypto.randomUUID();
              const callbackUrl = new URL(
                `/api/webhooks/${provider}/${webhookToken}`,
                webhookPublicUrl,
              ).toString();
              const webhookRegistrationId = await adapter.registerWebhooks(
                credentials,
                resource,
                callbackUrl,
                scopes,
              );
              await repository.registerWebhook(
                workspace.workspace.id,
                integration.id,
                webhookToken,
                webhookRegistrationId,
              );
            }

            return scopes;
          },
        );
        const scopes = await repository.replaceScopes(
          workspace.workspace.id,
          integration.id,
          workspace.membership.id,
          resolved,
        );
        await appendActivity(
          workspace,
          correlationId,
          provider,
          "integration.scopes.replace",
          `${providerRegistry.require(provider).displayName} scope access updated`,
        );
        return scopes.map(toScopeContract);
      } catch (error) {
        mapProviderError(error);
      }
    },

    async replaceMcpTools(
      userId: string,
      providerValue: string,
      toolNames: readonly string[],
      correlationId: string,
    ) {
      const workspace = await current(userId);

      if (workspace.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Workspace owner access is required.",
        );
      }

      if (new Set(toolNames).size !== toolNames.length) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "Duplicate MCP tool selection.",
        );
      }

      const provider = providerFromInput(providerValue, providerRegistry);
      const definition = providerRegistry.require(provider);
      const available = new Set(definition.mcpTools.map((tool) => tool.name));

      if (toolNames.some((name) => !available.has(name))) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "An MCP tool is unavailable for this provider.",
        );
      }

      const integration = await repository.findIntegration(
        workspace.workspace.id,
        workspace.membership.id,
        provider,
      );

      if (integration === null) {
        throw new HttpError(
          409,
          "INTEGRATION_REQUIRED",
          "The workspace integration must be installed first.",
        );
      }

      if (integration.status !== "connected") {
        throw new HttpError(
          409,
          "INTEGRATION_NOT_CONNECTED",
          "Connect the workspace integration first.",
        );
      }

      const selected = await repository.replaceMcpTools(
        workspace.workspace.id,
        integration.id,
        workspace.membership.id,
        toolNames,
      );
      await appendActivity(
        workspace,
        correlationId,
        provider,
        "integration.mcp-tools.replace",
        `${definition.displayName} MCP tools updated`,
      );
      return toMcpToolContracts(definition, selected);
    },

    async selectInstallation(
      userId: string,
      providerValue: string,
      externalId: string,
      correlationId: string,
    ) {
      const workspace = await current(userId);

      if (workspace.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Workspace owner access is required.",
        );
      }

      const provider = providerFromInput(providerValue, providerRegistry);
      const definition = providerRegistry.require(provider);

      if (definition.resourceSelection !== "application") {
        throw new HttpError(
          409,
          "RESOURCE_SELECTED_DURING_AUTHORIZATION",
          "This provider selects its workspace resource during authorization.",
        );
      }

      const adapter = adapterFor(provider, adapters);
      const { account, integration } = await accountContext(
        workspace,
        provider,
      );

      try {
        const resources = await withCredentials(
          workspace,
          integration,
          account,
          adapter,
          (credentials) => adapter.discoverResources(credentials),
        );
        const resource = resources.find(
          (item) => item.externalId === externalId,
        );

        if (resource === undefined) {
          throw new ProviderAdapterError("inaccessible_resource");
        }

        await repository.configure({
          clearScopes: true,
          configuration: { ...resource },
          configuredByMembershipId: workspace.membership.id,
          lastValidatedAt: new Date(),
          provider,
          status: "connected",
          workspaceId: workspace.workspace.id,
        });
        await appendActivity(
          workspace,
          correlationId,
          provider,
          "integration.installation.configure",
          `${providerRegistry.require(provider).displayName} resource selected`,
        );
        return toResourceContract(resource);
      } catch (error) {
        mapProviderError(error);
      }
    },

    async validate(
      userId: string,
      providerValue: string,
      correlationId: string,
    ) {
      const workspace = await current(userId);
      const provider = providerFromInput(providerValue, providerRegistry);
      const adapter = adapterFor(provider, adapters);
      const { account, integration } = await accountContext(
        workspace,
        provider,
      );
      const resource = readResource(integration);

      try {
        const resources = await withCredentials(
          workspace,
          integration,
          account,
          adapter,
          (credentials) => adapter.discoverResources(credentials),
        );

        if (
          resource !== null &&
          !resources.some((item) => item.externalId === resource.externalId)
        ) {
          throw new ProviderAdapterError("inaccessible_resource");
        }

        await repository.markAccountValidated(
          workspace.workspace.id,
          integration.id,
          workspace.membership.id,
        );

        if (workspace.membership.role === "owner" && resource !== null) {
          await repository.markInstallationValidated(
            workspace.workspace.id,
            integration.id,
            workspace.membership.id,
          );
        }

        await appendActivity(
          workspace,
          correlationId,
          provider,
          "integration.validate",
          `${providerRegistry.require(provider).displayName} connection validated`,
        );
      } catch (error) {
        mapProviderError(error);
      }
    },

    async setNotificationEventKeys(
      userId: string,
      providerValue: string,
      eventKeysInput: readonly string[],
      correlationId: string,
    ) {
      const workspace = await current(userId);

      if (workspace.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Workspace owner access is required.",
        );
      }

      const provider = providerFromInput(providerValue, providerRegistry);
      const definition = providerRegistry.require(provider);

      if (!definition.capabilities.includes("notifications")) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          `${definition.displayName} does not send notifications.`,
        );
      }

      const availableKeys = new Set(
        definition.notificationEvents.map((event) => event.key),
      );
      const eventKeys = [...new Set(eventKeysInput)].map((value) => {
        if (!availableKeys.has(value as NotificationEventKey)) {
          throw new HttpError(
            400,
            "INVALID_REQUEST",
            `Unknown notification event: ${value}.`,
          );
        }
        return value as NotificationEventKey;
      });

      const integration = await repository.findIntegration(
        workspace.workspace.id,
        workspace.membership.id,
        provider,
      );

      if (integration === null) {
        throw new HttpError(
          404,
          "INTEGRATION_NOT_FOUND",
          "Integration not found.",
        );
      }

      await repository.setNotificationEventKeys(
        workspace.workspace.id,
        integration.id,
        workspace.membership.id,
        eventKeys,
      );

      await appendActivity(
        workspace,
        correlationId,
        provider,
        "integration.notifications.set",
        `${definition.displayName} notification events updated (${String(eventKeys.length)} enabled)`,
      );

      return detailFor(workspace, provider);
    },
  };
}
