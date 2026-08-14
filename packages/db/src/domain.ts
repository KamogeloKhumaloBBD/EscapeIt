const encryptedCredentialBrand: unique symbol = Symbol(
  "EncryptedCredentialEnvelope",
);
const providerKeyBrand: unique symbol = Symbol("ProviderKey");
const scopeKeyBrand: unique symbol = Symbol("ScopeKey");
const notificationEventKeyBrand: unique symbol = Symbol("NotificationEventKey");

const providerKeyPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const namespacedKeyPattern =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

export type EncryptedCredentialEnvelope = string & {
  readonly [encryptedCredentialBrand]: true;
};

export type ProviderKey = string & { readonly [providerKeyBrand]: true };
export type ScopeKey = string & { readonly [scopeKeyBrand]: true };
export type NotificationEventKey = string & {
  readonly [notificationEventKeyBrand]: true;
};

export const connectionStatuses = [
  "disconnected",
  "connected",
  "error",
] as const;
export type ConnectionStatus = (typeof connectionStatuses)[number];

export const activityCategories = [
  "workspace",
  "integration",
  "mcp",
  "context",
  "webhook",
  "notification",
] as const;
export type ActivityCategory = (typeof activityCategories)[number];

export const activityStatuses = [
  "started",
  "succeeded",
  "partially_succeeded",
  "failed",
] as const;
export type ActivityStatus = (typeof activityStatuses)[number];

export type WorkspaceRole = "owner" | "member";

export class InvalidIntegrationKeyError extends Error {
  constructor(kind: "event" | "provider" | "scope", value: string) {
    super(`Invalid ${kind} key: ${value}`);
    this.name = "InvalidIntegrationKeyError";
  }
}

export function parseProviderKey(value: string): ProviderKey {
  if (value.length > 63 || !providerKeyPattern.test(value)) {
    throw new InvalidIntegrationKeyError("provider", value);
  }

  return value as ProviderKey;
}

export function parseScopeKey(value: string): ScopeKey {
  if (value.length > 191 || !namespacedKeyPattern.test(value)) {
    throw new InvalidIntegrationKeyError("scope", value);
  }

  return value as ScopeKey;
}

export function parseNotificationEventKey(value: string): NotificationEventKey {
  if (value.length > 191 || !namespacedKeyPattern.test(value)) {
    throw new InvalidIntegrationKeyError("event", value);
  }

  return value as NotificationEventKey;
}

export function integrationKeyBelongsToProvider(
  key: NotificationEventKey | ScopeKey,
  provider: ProviderKey,
): boolean {
  return key.startsWith(`${provider}.`);
}

export type JsonValue =
  boolean | Date | JsonObject | null | number | readonly JsonValue[] | string;
export interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

export interface Workspace {
  createdAt: Date;
  createdByUserId: string | null;
  id: string;
  name: string;
  updatedAt: Date;
}

export interface WorkspaceMembership {
  createdAt: Date;
  id: string;
  role: WorkspaceRole;
  updatedAt: Date;
  userId: string;
  workspaceId: string;
}

export interface WorkspaceInvitation {
  acceptedAt: Date | null;
  acceptedByMembershipId: string | null;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  invitedByMembershipId: string;
  normalizedEmail: string;
  revokedAt: Date | null;
  workspaceId: string;
}

export interface Integration {
  configuration: JsonObject;
  configuredByMembershipId: string | null;
  createdAt: Date;
  id: string;
  lastErrorCode: string | null;
  lastValidatedAt: Date | null;
  notificationEventKeys: readonly NotificationEventKey[];
  provider: ProviderKey;
  status: ConnectionStatus;
  updatedAt: Date;
  webhookRegistrationId: string | null;
  webhookToken: string | null;
  workspaceId: string;
}

export interface IntegrationMcpTool {
  createdAt: Date;
  enabledByMembershipId: string;
  id: string;
  integrationId: string;
  toolName: string;
  workspaceId: string;
}

export interface IntegrationAccount {
  createdAt: Date;
  credentialEnvelope: EncryptedCredentialEnvelope | null;
  id: string;
  integrationId: string;
  lastErrorCode: string | null;
  lastValidatedAt: Date | null;
  membershipId: string;
  status: ConnectionStatus;
  updatedAt: Date;
  workspaceId: string;
}

export interface IntegrationScope {
  createdAt: Date;
  createdByMembershipId: string;
  displayName: string;
  externalId: string;
  externalKey: string | null;
  id: string;
  integrationId: string;
  scopeKey: ScopeKey;
  workspaceId: string;
}

export interface McpToken {
  bundleId: string | null;
  createdAt: Date;
  createdByMembershipId: string;
  expiresAt: Date | null;
  id: string;
  lastUsedAt: Date | null;
  name: string;
  prefix: string;
  revokedAt: Date | null;
  revokedByMembershipId: string | null;
  workspaceId: string;
}

export interface IntegrationBundle {
  createdAt: Date;
  createdByMembershipId: string;
  description: string | null;
  id: string;
  name: string;
  updatedAt: Date;
  workspaceId: string;
}

export interface IntegrationBundleProvider {
  addedByMembershipId: string;
  bundleId: string;
  createdAt: Date;
  id: string;
  integrationId: string;
  workspaceId: string;
}

export interface NotificationChannel {
  configuration: JsonObject;
  createdAt: Date;
  createdByMembershipId: string;
  credentialEnvelope: EncryptedCredentialEnvelope | null;
  id: string;
  lastErrorCode: string | null;
  lastValidatedAt: Date | null;
  name: string;
  provider: ProviderKey;
  status: ConnectionStatus;
  updatedAt: Date;
  workspaceId: string;
}

export interface NotificationChannelSource {
  channelId: string;
  createdAt: Date;
  createdByMembershipId: string;
  id: string;
  provider: ProviderKey;
  workspaceId: string;
}

export interface NotificationPreference {
  createdAt: Date;
  enabled: boolean;
  eventKey: NotificationEventKey;
  id: string;
  membershipId: string;
  updatedAt: Date;
  workspaceId: string;
}

export interface ActivityEvent {
  actorMembershipId: string | null;
  category: ActivityCategory;
  correlationId: string;
  createdAt: Date;
  externalEventId: string | null;
  id: string;
  metadata: JsonObject;
  occurredAt: Date;
  operation: string;
  parentEventId: string | null;
  provider: ProviderKey | null;
  status: ActivityStatus;
  subjectMembershipId: string | null;
  summary: string;
  workspaceId: string;
}

export interface ActivityCursor {
  id: string;
  occurredAt: Date;
}

export interface ActivityPage {
  events: ActivityEvent[];
  nextCursor: ActivityCursor | null;
}
