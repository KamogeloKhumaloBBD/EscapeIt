import {
  integrationKeyBelongsToProvider,
  parseNotificationEventKey,
  parseProviderKey,
  parseScopeKey,
  type JsonObject,
  type NotificationEventKey,
  type NotificationPreference,
  type ProviderKey,
  type ScopeKey,
} from "@context-layer/db";
import type { z } from "zod";

export const providerCapabilities = [
  "context",
  "user-accounts",
  "scopes",
  "notifications",
  "webhooks",
] as const;

export type ProviderCapability = (typeof providerCapabilities)[number];
export type ProviderConfigurationSchema = z.ZodType<JsonObject>;

export interface ProviderScopeDefinition {
  displayName: string;
  key: ScopeKey;
}

export interface ProviderNotificationEventDefinition {
  defaultEnabled: boolean;
  displayName: string;
  key: NotificationEventKey;
}

export interface ProviderMcpToolDefinition {
  description: string;
  displayName: string;
  kind: "read" | "write";
  name: string;
}

export interface ProviderPresentationDefinition {
  accountLabel?: string;
  resourceLabel?: string;
  scopeLabels?: {
    plural: string;
    singular: string;
  };
}

export interface ProviderDefinition {
  accountCredentialSchema?: ProviderConfigurationSchema;
  autoSelectSingleResourceAfterAuthorization?: boolean;
  capabilities: readonly ProviderCapability[];
  description: string;
  displayName: string;
  installationConfigurationSchema?: ProviderConfigurationSchema;
  key: ProviderKey;
  mcpTools: readonly ProviderMcpToolDefinition[];
  notificationChannelConfigurationSchema?: ProviderConfigurationSchema;
  notificationEvents: readonly ProviderNotificationEventDefinition[];
  presentation: ProviderPresentationDefinition;
  resourceSelection?: "application" | "authorization";
  scopeKinds: readonly ProviderScopeDefinition[];
}

export interface ProviderRegistry {
  get(key: ProviderKey): ProviderDefinition | undefined;
  getNotificationEvent(
    key: NotificationEventKey,
  ): ProviderNotificationEventDefinition | undefined;
  list(): readonly ProviderDefinition[];
  require(key: ProviderKey): ProviderDefinition;
}

export class ProviderRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRegistryError";
  }
}

function validateDisplayName(displayName: string, subject: string): void {
  const length = displayName.trim().length;

  if (length < 1 || length > 120) {
    throw new ProviderRegistryError(
      `${subject} display name must contain between 1 and 120 characters.`,
    );
  }
}

function validateDefinition(
  definition: ProviderDefinition,
  scopeKeys: Set<ScopeKey>,
  eventKeys: Set<NotificationEventKey>,
  toolNames: Set<string>,
): void {
  parseProviderKey(definition.key);
  validateDisplayName(definition.displayName, `Provider ${definition.key}`);
  validateDisplayName(definition.description, `Provider ${definition.key}`);

  const capabilities = new Set(definition.capabilities);
  const { accountLabel, resourceLabel, scopeLabels } = definition.presentation;
  const hasResource = resourceLabel !== undefined;

  if (capabilities.size !== definition.capabilities.length) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} declares a capability more than once.`,
    );
  }

  if (capabilities.has("scopes") !== definition.scopeKinds.length > 0) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} must declare scope definitions exactly when it has the scopes capability.`,
    );
  }

  if (capabilities.has("user-accounts") !== (accountLabel !== undefined)) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} must declare an account label exactly when it has the user-accounts capability.`,
    );
  }

  if (capabilities.has("scopes") !== (scopeLabels !== undefined)) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} must declare scope labels exactly when it has the scopes capability.`,
    );
  }

  if (resourceLabel !== undefined && !capabilities.has("user-accounts")) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} cannot declare a resource label without the user-accounts capability.`,
    );
  }

  if (hasResource !== (definition.resourceSelection !== undefined)) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} must declare resource selection exactly when it declares a resource label.`,
    );
  }

  if (
    definition.autoSelectSingleResourceAfterAuthorization === true &&
    definition.resourceSelection !== "application"
  ) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} can auto-select a resource only when resource selection happens in the application.`,
    );
  }

  if (capabilities.has("scopes") && resourceLabel === undefined) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} must declare a resource label when it has the scopes capability.`,
    );
  }

  if (accountLabel !== undefined) {
    validateDisplayName(accountLabel, `Provider ${definition.key} account`);
  }

  if (resourceLabel !== undefined) {
    validateDisplayName(resourceLabel, `Provider ${definition.key} resource`);
  }

  if (scopeLabels !== undefined) {
    validateDisplayName(
      scopeLabels.singular,
      `Provider ${definition.key} singular scope`,
    );
    validateDisplayName(
      scopeLabels.plural,
      `Provider ${definition.key} plural scope`,
    );
  }

  if (
    capabilities.has("notifications") !==
    definition.notificationEvents.length > 0
  ) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} must declare notification events exactly when it has the notifications capability.`,
    );
  }

  if (capabilities.has("context") !== definition.mcpTools.length > 0) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} must declare MCP tools exactly when it has the context capability.`,
    );
  }

  for (const tool of definition.mcpTools) {
    validateDisplayName(tool.displayName, `MCP tool ${tool.name}`);
    validateDisplayName(tool.description, `MCP tool ${tool.name}`);

    if (
      !/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(tool.name) ||
      tool.name.length > 128 ||
      !tool.name.startsWith(`${definition.key}_`)
    ) {
      throw new ProviderRegistryError(
        `MCP tool ${tool.name} does not belong to provider ${definition.key}.`,
      );
    }

    if (toolNames.has(tool.name)) {
      throw new ProviderRegistryError(`Duplicate MCP tool name: ${tool.name}`);
    }

    toolNames.add(tool.name);
  }

  if (
    definition.accountCredentialSchema !== undefined &&
    !capabilities.has("user-accounts")
  ) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} has an account credential schema without the user-accounts capability.`,
    );
  }

  if (
    definition.notificationChannelConfigurationSchema !== undefined &&
    !capabilities.has("notifications")
  ) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} has a channel schema without the notifications capability.`,
    );
  }

  for (const scope of definition.scopeKinds) {
    parseScopeKey(scope.key);
    validateDisplayName(scope.displayName, `Scope ${scope.key}`);

    if (!integrationKeyBelongsToProvider(scope.key, definition.key)) {
      throw new ProviderRegistryError(
        `Scope ${scope.key} does not belong to provider ${definition.key}.`,
      );
    }

    if (scopeKeys.has(scope.key)) {
      throw new ProviderRegistryError(`Duplicate scope key: ${scope.key}`);
    }

    scopeKeys.add(scope.key);
  }

  for (const event of definition.notificationEvents) {
    parseNotificationEventKey(event.key);
    validateDisplayName(event.displayName, `Event ${event.key}`);

    if (!integrationKeyBelongsToProvider(event.key, definition.key)) {
      throw new ProviderRegistryError(
        `Event ${event.key} does not belong to provider ${definition.key}.`,
      );
    }

    if (eventKeys.has(event.key)) {
      throw new ProviderRegistryError(`Duplicate event key: ${event.key}`);
    }

    eventKeys.add(event.key);
  }
}

export function createProviderRegistry(
  definitions: readonly ProviderDefinition[],
): ProviderRegistry {
  const providers = new Map<ProviderKey, ProviderDefinition>();
  const events = new Map<
    NotificationEventKey,
    ProviderNotificationEventDefinition
  >();
  const scopeKeys = new Set<ScopeKey>();
  const eventKeys = new Set<NotificationEventKey>();
  const toolNames = new Set<string>();

  for (const definition of definitions) {
    validateDefinition(definition, scopeKeys, eventKeys, toolNames);

    if (providers.has(definition.key)) {
      throw new ProviderRegistryError(
        `Duplicate provider key: ${definition.key}`,
      );
    }

    providers.set(definition.key, definition);

    for (const event of definition.notificationEvents) {
      events.set(event.key, event);
    }
  }

  const registered = Object.freeze([...providers.values()]);

  return {
    get(key) {
      return providers.get(key);
    },
    getNotificationEvent(key) {
      return events.get(key);
    },
    list() {
      return registered;
    },
    require(key) {
      const provider = providers.get(key);

      if (provider === undefined) {
        throw new ProviderRegistryError(`Unknown provider: ${key}`);
      }

      return provider;
    },
  };
}

export function resolveProviderEventPreference(
  definition: ProviderNotificationEventDefinition,
  override: Pick<NotificationPreference, "enabled"> | null | undefined,
): boolean {
  return override?.enabled ?? definition.defaultEnabled;
}
