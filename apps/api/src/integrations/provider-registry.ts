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

export interface ProviderDefinition {
  accountCredentialSchema?: ProviderConfigurationSchema;
  capabilities: readonly ProviderCapability[];
  displayName: string;
  installationConfigurationSchema?: ProviderConfigurationSchema;
  key: ProviderKey;
  notificationChannelConfigurationSchema?: ProviderConfigurationSchema;
  notificationEvents: readonly ProviderNotificationEventDefinition[];
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
): void {
  parseProviderKey(definition.key);
  validateDisplayName(definition.displayName, `Provider ${definition.key}`);

  const capabilities = new Set(definition.capabilities);

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

  if (
    capabilities.has("notifications") !==
    definition.notificationEvents.length > 0
  ) {
    throw new ProviderRegistryError(
      `Provider ${definition.key} must declare notification events exactly when it has the notifications capability.`,
    );
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

  for (const definition of definitions) {
    validateDefinition(definition, scopeKeys, eventKeys);

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
