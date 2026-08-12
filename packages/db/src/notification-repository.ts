import type { DatabaseClient } from "./client";
import { withTransaction } from "./client";
import type {
  ConnectionStatus,
  EncryptedCredentialEnvelope,
  JsonObject,
  NotificationChannel,
  NotificationEventKey,
  NotificationPreference,
  ProviderKey,
} from "./domain";
import { RepositoryError } from "./repository-errors";
import {
  createProductId,
  requireMembership,
  requireOwner,
  requireReturnedRow,
} from "./repository-helpers";

export interface CreateNotificationChannelInput {
  channelId: string;
  configuration: JsonObject;
  createdByMembershipId: string;
  credentialEnvelope: EncryptedCredentialEnvelope | null;
  lastErrorCode?: string | null;
  lastValidatedAt?: Date | null;
  name: string;
  provider: ProviderKey;
  status: ConnectionStatus;
  workspaceId: string;
}

export interface UpdateNotificationChannelInput {
  channelId: string;
  configuration: JsonObject;
  credentialEnvelope: EncryptedCredentialEnvelope | null;
  lastErrorCode?: string | null;
  lastValidatedAt?: Date | null;
  name: string;
  ownerMembershipId: string;
  status: ConnectionStatus;
  workspaceId: string;
}

function validateCredentialState(
  status: ConnectionStatus,
  credentialEnvelope: EncryptedCredentialEnvelope | null,
): void {
  if (
    (status === "disconnected" && credentialEnvelope !== null) ||
    (status !== "disconnected" && credentialEnvelope === null)
  ) {
    throw new RepositoryError(
      "invalid",
      "Credential state does not match the channel status.",
    );
  }
}

export async function createNotificationChannel(
  database: DatabaseClient,
  input: CreateNotificationChannelInput,
): Promise<NotificationChannel> {
  validateCredentialState(input.status, input.credentialEnvelope);

  return withTransaction(database, async (transaction) => {
    await requireOwner(
      transaction,
      input.workspaceId,
      input.createdByMembershipId,
    );
    const rows = await transaction<NotificationChannel[]>`
      insert into notification_channels (
        id,
        "workspaceId",
        provider,
        status,
        name,
        configuration,
        "credentialEnvelope",
        "createdByMembershipId",
        "lastValidatedAt",
        "lastErrorCode"
      ) values (
        ${input.channelId},
        ${input.workspaceId},
        ${input.provider},
        ${input.status},
        ${input.name.trim()},
        ${transaction.json(input.configuration)},
        ${input.credentialEnvelope},
        ${input.createdByMembershipId},
        ${input.lastValidatedAt ?? null},
        ${input.lastErrorCode ?? null}
      )
      returning *
    `;

    return requireReturnedRow(rows[0]);
  });
}

export async function updateNotificationChannel(
  database: DatabaseClient,
  input: UpdateNotificationChannelInput,
): Promise<NotificationChannel> {
  validateCredentialState(input.status, input.credentialEnvelope);

  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, input.workspaceId, input.ownerMembershipId);
    const rows = await transaction<NotificationChannel[]>`
      update notification_channels
      set
        status = ${input.status},
        name = ${input.name.trim()},
        configuration = ${transaction.json(input.configuration)},
        "credentialEnvelope" = ${input.credentialEnvelope},
        "lastValidatedAt" = ${input.lastValidatedAt ?? null},
        "lastErrorCode" = ${input.lastErrorCode ?? null},
        "updatedAt" = now()
      where id = ${input.channelId} and "workspaceId" = ${input.workspaceId}
      returning *
    `;
    const channel = rows[0];

    if (channel === undefined) {
      throw new RepositoryError("not_found", "Notification channel not found.");
    }

    return channel;
  });
}

export async function listNotificationChannels(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
): Promise<NotificationChannel[]> {
  await requireMembership(database, workspaceId, membershipId);

  return database<NotificationChannel[]>`
    select *
    from notification_channels
    where "workspaceId" = ${workspaceId}
    order by "createdAt", id
  `;
}

export async function findNotificationChannel(
  database: DatabaseClient,
  workspaceId: string,
  channelId: string,
): Promise<NotificationChannel | null> {
  const rows = await database<NotificationChannel[]>`
    select *
    from notification_channels
    where "workspaceId" = ${workspaceId} and id = ${channelId}
  `;

  return rows[0] ?? null;
}

export async function deleteNotificationChannel(
  database: DatabaseClient,
  workspaceId: string,
  channelId: string,
  ownerMembershipId: string,
): Promise<boolean> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const rows = await transaction<{ id: string }[]>`
      delete from notification_channels
      where id = ${channelId} and "workspaceId" = ${workspaceId}
      returning id
    `;

    return rows[0] !== undefined;
  });
}

export async function setNotificationPreferenceOverride(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
  eventKey: NotificationEventKey,
  enabled: boolean,
): Promise<NotificationPreference> {
  await requireMembership(database, workspaceId, membershipId);
  const rows = await database<NotificationPreference[]>`
    insert into notification_preferences (
      id,
      "workspaceId",
      "membershipId",
      "eventKey",
      enabled
    ) values (
      ${createProductId()},
      ${workspaceId},
      ${membershipId},
      ${eventKey},
      ${enabled}
    )
    on conflict ("membershipId", "eventKey") do update set
      enabled = excluded.enabled,
      "updatedAt" = now()
    returning *
  `;

  return requireReturnedRow(rows[0]);
}

export async function clearNotificationPreferenceOverride(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
  eventKey: NotificationEventKey,
): Promise<boolean> {
  await requireMembership(database, workspaceId, membershipId);
  const rows = await database<{ id: string }[]>`
    delete from notification_preferences
    where
      "workspaceId" = ${workspaceId}
      and "membershipId" = ${membershipId}
      and "eventKey" = ${eventKey}
    returning id
  `;

  return rows[0] !== undefined;
}

export async function listNotificationPreferenceOverrides(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
): Promise<NotificationPreference[]> {
  await requireMembership(database, workspaceId, membershipId);

  return database<NotificationPreference[]>`
    select *
    from notification_preferences
    where "workspaceId" = ${workspaceId} and "membershipId" = ${membershipId}
    order by "eventKey"
  `;
}

export function resolveNotificationPreference(
  defaultEnabled: boolean,
  override: Pick<NotificationPreference, "enabled"> | null | undefined,
): boolean {
  return override?.enabled ?? defaultEnabled;
}
