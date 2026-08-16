import {
  InvalidIntegrationKeyError,
  parseProviderKey,
  type AppendActivityEventInput,
  type ConnectIntegrationAccountWithoutResourceInput,
  type ConnectIntegrationAccountWithResourceInput,
  type CurrentWorkspace,
  type EncryptedCredentialEnvelope,
  type Integration,
  type IntegrationAccount,
  type IntegrationConnectionContext,
  type IntegrationMcpTool,
  type IntegrationScope,
  type JsonValue,
  type NotificationChannel,
  type NotificationEventKey,
  type ProviderKey,
  type SaveIntegrationAccountInput,
  type SelectedIntegrationScopeInput,
} from "@context-layer/db";
import { z } from "zod";

import { HttpError } from "../../errors";
import type { CredentialEncryption } from "@context-layer/security";
import {
  ProviderAdapterError,
  type IntegrationAdapter,
  type OAuthCredentials,
  type ProviderResource,
} from "@context-layer/integrations";
import { createOAuthState } from "../../integrations/oauth-state";
import {
  ProviderAccountRuntimeError,
  type ProviderAccountRuntime,
} from "@context-layer/integrations";
import type { ProviderRegistry } from "@context-layer/integrations";
import { requireWorkspace } from "../shared/require-workspace";
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
const grantedScopesSchema = z.object({ scopes: z.array(z.string()) });

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
  connectAccountWithoutResource(
    input: ConnectIntegrationAccountWithoutResourceInput,
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
  /**
   * Where members are sent to authorise event delivery for providers that
   * need more than OAuth. Null leaves the prompt hidden.
   */
  notificationSetupUrl: string | null;
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
      409,
      "CREDENTIALS_UNAVAILABLE",
      "Your provider credentials are no longer usable. Reconnect your account and try again.",
    );
  }

  if (error instanceof ProviderAdapterError) {
    const mapping = {
      authorization_expired: [
        409,
        "PROVIDER_AUTHORIZATION_EXPIRED",
        "Your provider authorization has expired. Reconnect your account and try again.",
      ],
      content_too_large: [
        413,
        "PROVIDER_CONTENT_TOO_LARGE",
        "The provider content is too large. Choose a smaller item and try again.",
      ],
      forbidden: [
        403,
        "PROVIDER_PERMISSION_REQUIRED",
        "Your provider account is missing a required permission. Grant access or ask a provider administrator, then reconnect.",
      ],
      inaccessible_resource: [
        409,
        "PROVIDER_RESOURCE_UNAVAILABLE",
        "Your provider account cannot access the workspace's selected resource. Use an account with access or ask a workspace owner to select another resource.",
      ],
      invalid_request: [
        400,
        "PROVIDER_REQUEST_REJECTED",
        "The provider rejected this request. Review the selected values and try again.",
      ],
      invalid_response: [
        503,
        "PROVIDER_INVALID_RESPONSE",
        "The provider returned an unexpected response. Wait a few minutes, then try again.",
      ],
      not_found: [
        404,
        "PROVIDER_RESOURCE_NOT_FOUND",
        "The provider resource no longer exists or is inaccessible. Select another resource and try again.",
      ],
      temporarily_unavailable: [
        503,
        "PROVIDER_UNAVAILABLE",
        "The provider is temporarily unavailable. Wait a few minutes, then try again.",
      ],
      unsupported_content: [
        415,
        "PROVIDER_CONTENT_UNSUPPORTED",
        "This content type is not supported. Choose a supported provider item and try again.",
      ],
    } as const;
    const [status, code, message] = mapping[error.code];
    throw new HttpError(status, code, message);
  }

  throw error;
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

/**
 * Best effort webhook cleanup. A provider that has already dropped the
 * webhook, or a member who can no longer administer it, must not block the
 * action the user actually asked for.
 */
async function removeWebhooks(
  adapter: IntegrationAdapter,
  credentials: OAuthCredentials,
  resource: ProviderResource,
  registrationId: string | null,
): Promise<void> {
  if (adapter.unregisterWebhooks === undefined || registrationId === null) {
    return;
  }

  try {
    await adapter.unregisterWebhooks(credentials, resource, registrationId);
  } catch {
    // Leaving a stale webhook behind is preferable to failing the request.
  }
}

function readResource(integration: Integration): ProviderResource | null {
  const parsed = resourceSchema.safeParse(integration.configuration);
  return parsed.success ? parsed.data : null;
}

// Some providers (Bitbucket) fix their OAuth consumer's granted scopes at
// registration time outside of this application, so the scopes actually
// granted to a token can differ from whatever the provider's own OAuth
// client requested. Decrypting the caller's own stored credentials here
// (never another member's) lets the owner see exactly what was granted,
// rather than silently trusting the consumer configuration.
function readGrantedScopes(
  encryption: CredentialEncryption,
  account: IntegrationAccount,
): readonly string[] | null {
  if (account.credentialEnvelope === null) {
    return null;
  }

  try {
    const parsed = grantedScopesSchema.safeParse(
      encryption.decrypt(
        account.credentialEnvelope,
        "integration-account",
        account.id,
      ),
    );
    return parsed.success ? parsed.data.scopes : null;
  } catch {
    return null;
  }
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
  grantedScopes: readonly string[] | null = null,
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
  const errorCode = account?.lastErrorCode ?? integration?.lastErrorCode;
  let attention: string | null = null;

  if (integration?.status === "error" || account?.status === "error") {
    switch (errorCode) {
      case "PROVIDER_AUTHORIZATION_EXPIRED":
      case "authorization_expired":
      case "CREDENTIALS_UNAVAILABLE":
      case "credentials_unavailable":
        attention = `Your ${definition.displayName} authorization has expired. Reconnect your account to restore access.`;
        break;
      case "PROVIDER_PERMISSION_REQUIRED":
      case "forbidden":
        attention = `Your ${definition.displayName} account is missing a required permission. Grant access, then reconnect the account.`;
        break;
      case "PROVIDER_RESOURCE_UNAVAILABLE":
      case "PROVIDER_RESOURCE_NOT_FOUND":
      case "inaccessible_resource":
        attention = isOwner
          ? `The connected account cannot access the selected ${definition.displayName} resource. Reconnect with an account that has access or select another resource.`
          : `Your account cannot access the workspace's selected ${definition.displayName} resource. Reconnect with an account that has access or ask the workspace owner for help.`;
        break;
      default:
        attention = isOwner
          ? `The ${definition.displayName} connection could not be validated. Validate it again, then reconnect if the problem continues.`
          : `Your ${definition.displayName} account could not be validated. Reconnect it to restore access.`;
    }
  }

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
    attention,
    capabilities: definition.capabilities,
    currentAccount:
      account === null
        ? null
        : {
            grantedScopes,
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
      canManageNotificationChannels: hasNotificationChannels && isOwner,
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
  notificationSetupUrl,
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
    metadata?: Record<string, JsonValue>,
  ) {
    await repository.appendActivity({
      actorMembershipId: workspace.membership.id,
      category: "integration",
      correlationId,
      ...(metadata === undefined ? {} : { metadata }),
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

    const grantedScopes =
      account === null
        ? null
        : readGrantedScopes(credentialEncryption, account);

    return {
      ...buildSummary(
        definition,
        workspace.membership.role,
        integration,
        account,
        scopes,
        selectedMcpTools,
        connectedChannelCount,
        grantedScopes,
      ),
      mcpTools: toMcpToolContracts(definition, selectedMcpTools),
      notificationEvents: toNotificationEventContracts(definition, integration),
      notificationSetupUrl:
        definition.requiresNotificationSetup === true
          ? notificationSetupUrl
          : null,
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
        authorizationUrl:
          workspace.membership.role === "owner" &&
          readResource(context.integration) === null &&
          adapter.buildInstallationAuthorizationUrl !== undefined
            ? adapter.buildInstallationAuthorizationUrl(state)
            : adapter.buildAuthorizationUrl(state),
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
        const resources = await adapter.discoverResources(credentials);
        const configuredResource = readResource(context.integration);
        const configuredResourceIsAccessible =
          configuredResource !== null &&
          resources.some(
            (resource) => resource.externalId === configuredResource.externalId,
          );
        const replaceUnavailableApplicationResource =
          configuredResource !== null &&
          !configuredResourceIsAccessible &&
          definition.resourceSelection === "application" &&
          definition.autoSelectSingleResourceAfterAuthorization === true &&
          workspace.membership.role === "owner";
        const authorizationResource =
          configuredResource === null &&
          definition.resourceSelection === "authorization"
            ? resources[0]
            : null;
        const applicationResource =
          (configuredResource === null ||
            replaceUnavailableApplicationResource) &&
          definition.resourceSelection === "application" &&
          definition.autoSelectSingleResourceAfterAuthorization === true &&
          workspace.membership.role === "owner" &&
          resources.length === 1
            ? resources[0]
            : null;
        const reconnectResource =
          configuredResourceIsAccessible &&
          context.integration.status !== "connected"
            ? configuredResource
            : null;
        const connectionResource =
          authorizationResource ?? applicationResource ?? reconnectResource;

        if (
          configuredResource === null &&
          definition.resourceSelection === "authorization" &&
          (workspace.membership.role !== "owner" || resources.length !== 1)
        ) {
          throw new ProviderAdapterError("invalid_response");
        }

        if (
          configuredResource !== null &&
          !configuredResourceIsAccessible &&
          !replaceUnavailableApplicationResource
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
          integrationId: context.integration.id,
          lastValidatedAt: new Date(),
          membershipId: workspace.membership.id,
          status: "connected",
          workspaceId: workspace.workspace.id,
        };

        if (connectionResource === null) {
          if (replaceUnavailableApplicationResource) {
            await repository.connectAccountWithoutResource({
              account: accountInput,
              provider,
            });
          } else {
            await repository.saveAccount(accountInput);
          }
        } else {
          await repository.connectAccountWithResource({
            account: accountInput,
            installation: {
              configuration: { ...connectionResource },
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
          { grantedScopes: credentials.scopes },
        );

        const followUpAuthorization =
          connectionResource === null &&
          resources.length === 0 &&
          definition.autoSelectSingleResourceAfterAuthorization === true &&
          workspace.membership.role === "owner" &&
          adapter.buildInstallationAuthorizationUrl !== undefined
            ? (() => {
                const state = createOAuthState(
                  oauthStateSecret,
                  workspace.membership.id,
                  provider,
                );

                return {
                  authorizationUrl:
                    adapter.buildInstallationAuthorizationUrl(state),
                  state,
                };
              })()
            : null;

        return { followUpAuthorization, resources };
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

      // Remove the provider-side webhooks before the installation goes away,
      // while the credentials needed to delete them are still readable.
      const resource = readResource(integration);

      if (
        resource !== null &&
        integration.webhookRegistrationId !== null &&
        providerRegistry
          .require(provider)
          .capabilities.includes("notifications")
      ) {
        const adapter = adapterFor(provider, adapters);
        const account = await repository.findAccount(
          workspace.workspace.id,
          integration.id,
          workspace.membership.id,
        );

        if (account !== null) {
          try {
            await withCredentials(
              workspace,
              integration,
              account,
              adapter,
              (credentials) =>
                removeWebhooks(
                  adapter,
                  credentials,
                  resource,
                  integration.webhookRegistrationId,
                ),
            );
          } catch {
            // Credentials may already be expired or revoked; the disconnect
            // itself must still go through.
          }
        }
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
              // Deselecting a scope must stop its deliveries. Providers whose
              // webhooks are per scope cannot tell which ones to drop, so the
              // previous registration is removed before the new one is made.
              await removeWebhooks(
                adapter,
                credentials,
                resource,
                integration.webhookRegistrationId,
              );

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
