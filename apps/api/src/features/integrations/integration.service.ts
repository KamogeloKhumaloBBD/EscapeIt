import {
  InvalidIntegrationKeyError,
  parseProviderKey,
  type AppendActivityEventInput,
  type CurrentWorkspace,
  type EncryptedCredentialEnvelope,
  type Integration,
  type IntegrationAccount,
  type IntegrationConnectionContext,
  type IntegrationScope,
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
import type { ProviderRegistry } from "../../integrations/provider-registry";
import type {
  IntegrationDetailContract,
  IntegrationResourceContract,
  IntegrationScopeContract,
  IntegrationSummaryContract,
  ScopeDiscoveryContract,
} from "./integration.contracts";

const credentialsSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
  refreshToken: z.string().min(1),
  scopes: z.array(z.string()),
});
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
  saveAccount(input: SaveIntegrationAccountInput): Promise<IntegrationAccount>;
}

export interface IntegrationServiceDependencies {
  adapters: ReadonlyMap<ProviderKey, IntegrationAdapter>;
  credentialEncryption: CredentialEncryption;
  oauthStateSecret: string;
  providerRegistry: ProviderRegistry;
  repository: IntegrationRepository;
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
  if (error instanceof ProviderAdapterError) {
    const mapping = {
      authorization_expired: [
        409,
        "PROVIDER_AUTHORIZATION_EXPIRED",
        "Reconnect your provider account and try again.",
      ],
      inaccessible_resource: [
        409,
        "PROVIDER_RESOURCE_UNAVAILABLE",
        "The selected provider resource is unavailable.",
      ],
      invalid_response: [
        503,
        "PROVIDER_INVALID_RESPONSE",
        "The provider returned an unexpected response.",
      ],
      temporarily_unavailable: [
        503,
        "PROVIDER_UNAVAILABLE",
        "The provider is temporarily unavailable.",
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

function buildSummary(
  definition: ReturnType<ProviderRegistry["require"]>,
  role: CurrentWorkspace["membership"]["role"],
  integration: Integration | null,
  account: IntegrationAccount | null,
  scopes: readonly IntegrationScope[],
): IntegrationSummaryContract {
  const resource = integration === null ? null : readResource(integration);
  const isOwner = role === "owner";
  let nextStep: IntegrationSummaryContract["nextStep"];

  if (integration === null) {
    nextStep = isOwner ? "connect_provider" : "wait_for_owner";
  } else if (account?.status !== "connected") {
    nextStep = "connect_account";
  } else if (resource === null || integration.status !== "connected") {
    nextStep = isOwner ? "select_site" : "wait_for_owner";
  } else if (scopes.length === 0) {
    nextStep = isOwner ? "select_scopes" : "wait_for_owner";
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
            lastValidatedAt: integration.lastValidatedAt?.toISOString() ?? null,
            resource: toResourceContract(resource),
            selectedScopeCount: scopes.length,
            status: integration.status,
          },
    nextStep,
    permissions: {
      canConnectAccount: integration !== null || isOwner,
      canManageInstallation: isOwner,
      canManageScopes: isOwner && resource !== null,
    },
    provider: definition.key,
  };
}

function readCredentials(
  encryption: CredentialEncryption,
  account: IntegrationAccount,
): OAuthCredentials {
  if (account.credentialEnvelope === null) {
    throw new HttpError(
      409,
      "PROVIDER_ACCOUNT_REQUIRED",
      "Connect your provider account first.",
    );
  }

  let decrypted: unknown;

  try {
    decrypted = encryption.decrypt(
      account.credentialEnvelope,
      "integration-account",
      account.id,
    );
  } catch {
    throw new HttpError(
      500,
      "CREDENTIALS_UNAVAILABLE",
      "The stored provider credentials could not be read.",
    );
  }

  const parsed = credentialsSchema.safeParse(decrypted);

  if (!parsed.success) {
    throw new HttpError(
      500,
      "CREDENTIALS_UNAVAILABLE",
      "The stored provider credentials could not be read.",
    );
  }

  return parsed.data;
}

export function createIntegrationService({
  adapters,
  credentialEncryption,
  oauthStateSecret,
  providerRegistry,
  repository,
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

  async function refreshAccountCredentials(
    workspace: CurrentWorkspace,
    integration: Integration,
    account: IntegrationAccount,
    adapter: IntegrationAdapter,
    credentials: OAuthCredentials,
  ): Promise<OAuthCredentials> {
    if (account.credentialEnvelope === null) {
      throw new HttpError(
        409,
        "PROVIDER_ACCOUNT_REQUIRED",
        "Connect your provider account first.",
      );
    }

    const refreshed = await adapter.refreshCredentials(credentials);
    const envelope = credentialEncryption.encrypt(
      refreshed,
      "integration-account",
      account.id,
    );
    const updated = await repository.replaceAccountCredentials(
      {
        accountId: account.id,
        credentialEnvelope: envelope,
        externalAccountId: account.externalAccountId,
        externalDisplayName: account.externalDisplayName,
        integrationId: integration.id,
        lastValidatedAt: new Date(),
        membershipId: workspace.membership.id,
        status: "connected",
        workspaceId: workspace.workspace.id,
      },
      account.credentialEnvelope,
    );

    if (updated !== null) {
      return refreshed;
    }

    const currentAccount = await repository.findAccount(
      workspace.workspace.id,
      integration.id,
      workspace.membership.id,
    );

    if (currentAccount === null) {
      throw new HttpError(
        409,
        "PROVIDER_ACCOUNT_REQUIRED",
        "Connect your provider account first.",
      );
    }

    return readCredentials(credentialEncryption, currentAccount);
  }

  async function withCredentials<T>(
    workspace: CurrentWorkspace,
    integration: Integration,
    account: IntegrationAccount,
    adapter: IntegrationAdapter,
    operation: (credentials: OAuthCredentials) => Promise<T>,
  ): Promise<T> {
    let credentials = readCredentials(credentialEncryption, account);
    let refreshedBeforeRequest = false;

    if (new Date(credentials.expiresAt).getTime() <= Date.now() + 60_000) {
      credentials = await refreshAccountCredentials(
        workspace,
        integration,
        account,
        adapter,
        credentials,
      );
      refreshedBeforeRequest = true;
    }

    try {
      return await operation(credentials);
    } catch (error) {
      if (
        !(error instanceof ProviderAdapterError) ||
        error.code !== "authorization_expired" ||
        refreshedBeforeRequest
      ) {
        throw error;
      }

      const refreshed = await refreshAccountCredentials(
        workspace,
        integration,
        account,
        adapter,
        credentials,
      );
      return operation(refreshed);
    }
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
    const scopes =
      integration === null
        ? []
        : await repository.listScopes(
            workspace.workspace.id,
            integration.id,
            workspace.membership.id,
          );

    return {
      ...buildSummary(
        definition,
        workspace.membership.role,
        integration,
        account,
        scopes,
      ),
      selectedScopes: scopes.map(toScopeContract),
    };
  }

  async function accountContext(
    workspace: CurrentWorkspace,
    provider: ProviderKey,
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
        await repository.saveAccount({
          accountId: context.account.id,
          credentialEnvelope: envelope,
          externalAccountId: identity.externalAccountId,
          externalDisplayName: identity.displayName,
          integrationId: context.integration.id,
          lastValidatedAt: new Date(),
          membershipId: workspace.membership.id,
          status: "connected",
          workspaceId: workspace.workspace.id,
        });

        if (
          configuredResource === null &&
          workspace.membership.role === "owner" &&
          resources.length === 1
        ) {
          await repository.configure({
            configuration: { ...resources[0] },
            configuredByMembershipId: workspace.membership.id,
            lastValidatedAt: new Date(),
            provider,
            status: "connected",
            workspaceId: workspace.workspace.id,
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
      );
      const resource = readResource(integration);

      if (resource === null) {
        throw new HttpError(
          409,
          "INTEGRATION_SITE_REQUIRED",
          "Select a provider site first.",
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
      const installed = await repository.listIntegrations(
        workspace.workspace.id,
        workspace.membership.id,
      );
      const installedByProvider = new Map(
        installed.map((integration) => [integration.provider, integration]),
      );

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
          const scopes =
            integration === null
              ? []
              : await repository.listScopes(
                  workspace.workspace.id,
                  integration.id,
                  workspace.membership.id,
                );
          return buildSummary(
            definition,
            workspace.membership.role,
            integration,
            account,
            scopes,
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
          "Duplicate project selection.",
        );
      }

      const provider = providerFromInput(providerValue, providerRegistry);
      const adapter = adapterFor(provider, adapters);
      const { account, integration } = await accountContext(
        workspace,
        provider,
      );
      const resource = readResource(integration);

      if (resource === null) {
        throw new HttpError(
          409,
          "INTEGRATION_SITE_REQUIRED",
          "Select a provider site first.",
        );
      }

      try {
        const resolved = await withCredentials(
          workspace,
          integration,
          account,
          adapter,
          (credentials) =>
            adapter.resolveScopes(credentials, resource, externalIds),
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
          `${providerRegistry.require(provider).displayName} project access updated`,
        );
        return scopes.map(toScopeContract);
      } catch (error) {
        mapProviderError(error);
      }
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
          `${providerRegistry.require(provider).displayName} site selected`,
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
  };
}
