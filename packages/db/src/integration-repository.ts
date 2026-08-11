import type { DatabaseClient } from "./client.js";
import { withTransaction } from "./client.js";
import type {
  ConnectionStatus,
  EncryptedCredentialEnvelope,
  Integration,
  IntegrationAccount,
  IntegrationScope,
  JsonObject,
  ProviderKey,
  ScopeKey,
} from "./domain.js";
import { integrationKeyBelongsToProvider } from "./domain.js";
import { RepositoryError } from "./repository-errors.js";
import {
  createProductId,
  requireMembership,
  requireOwner,
  requireReturnedRow,
} from "./repository-helpers.js";

export interface ConfigureIntegrationInput {
  configuration: JsonObject;
  configuredByMembershipId: string;
  lastErrorCode?: string | null;
  lastValidatedAt?: Date | null;
  provider: ProviderKey;
  status: ConnectionStatus;
  workspaceId: string;
}

export interface SaveIntegrationAccountInput {
  accountId: string;
  credentialEnvelope: EncryptedCredentialEnvelope | null;
  externalAccountId: string | null;
  externalDisplayName?: string | null;
  integrationId: string;
  lastErrorCode?: string | null;
  lastValidatedAt?: Date | null;
  membershipId: string;
  status: ConnectionStatus;
  workspaceId: string;
}

export interface SelectedIntegrationScopeInput {
  displayName: string;
  externalId: string;
  scopeKey: ScopeKey;
}

function validateCredentialState(input: SaveIntegrationAccountInput): void {
  if (
    (input.status === "disconnected" && input.credentialEnvelope !== null) ||
    (input.status !== "disconnected" && input.credentialEnvelope === null)
  ) {
    throw new RepositoryError(
      "invalid",
      "Credential state does not match the connection status.",
    );
  }

  if (input.status === "connected" && input.externalAccountId === null) {
    throw new RepositoryError(
      "invalid",
      "A connected provider account requires an external account ID.",
    );
  }
}

export async function configureIntegration(
  database: DatabaseClient,
  input: ConfigureIntegrationInput,
): Promise<Integration> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(
      transaction,
      input.workspaceId,
      input.configuredByMembershipId,
    );

    const rows = await transaction<Integration[]>`
      insert into integrations (
        id,
        "workspaceId",
        provider,
        status,
        configuration,
        "configuredByMembershipId",
        "lastValidatedAt",
        "lastErrorCode"
      ) values (
        ${createProductId()},
        ${input.workspaceId},
        ${input.provider},
        ${input.status},
        ${transaction.json(input.configuration)},
        ${input.configuredByMembershipId},
        ${input.lastValidatedAt ?? null},
        ${input.lastErrorCode ?? null}
      )
      on conflict ("workspaceId", provider) do update set
        status = excluded.status,
        configuration = excluded.configuration,
        "configuredByMembershipId" = excluded."configuredByMembershipId",
        "lastValidatedAt" = excluded."lastValidatedAt",
        "lastErrorCode" = excluded."lastErrorCode",
        "updatedAt" = now()
      returning *
    `;

    return requireReturnedRow(rows[0]);
  });
}

export async function saveIntegrationAccount(
  database: DatabaseClient,
  input: SaveIntegrationAccountInput,
): Promise<IntegrationAccount> {
  validateCredentialState(input);

  return withTransaction(database, async (transaction) => {
    await requireMembership(transaction, input.workspaceId, input.membershipId);

    const integrations = await transaction<{ id: string }[]>`
      select id
      from integrations
      where id = ${input.integrationId} and "workspaceId" = ${input.workspaceId}
    `;

    if (integrations[0] === undefined) {
      throw new RepositoryError("not_found", "Integration not found.");
    }

    const rows = await transaction<IntegrationAccount[]>`
      insert into integration_accounts (
        id,
        "workspaceId",
        "integrationId",
        "membershipId",
        status,
        "externalAccountId",
        "externalDisplayName",
        "credentialEnvelope",
        "lastValidatedAt",
        "lastErrorCode"
      ) values (
        ${input.accountId},
        ${input.workspaceId},
        ${input.integrationId},
        ${input.membershipId},
        ${input.status},
        ${input.externalAccountId},
        ${input.externalDisplayName ?? null},
        ${input.credentialEnvelope},
        ${input.lastValidatedAt ?? null},
        ${input.lastErrorCode ?? null}
      )
      on conflict ("integrationId", "membershipId") do update set
        status = excluded.status,
        "externalAccountId" = excluded."externalAccountId",
        "externalDisplayName" = excluded."externalDisplayName",
        "credentialEnvelope" = excluded."credentialEnvelope",
        "lastValidatedAt" = excluded."lastValidatedAt",
        "lastErrorCode" = excluded."lastErrorCode",
        "updatedAt" = now()
      returning *
    `;

    return requireReturnedRow(rows[0]);
  });
}

export async function replaceIntegrationScopes(
  database: DatabaseClient,
  workspaceId: string,
  integrationId: string,
  ownerMembershipId: string,
  scopes: readonly SelectedIntegrationScopeInput[],
): Promise<IntegrationScope[]> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const integrations = await transaction<{ provider: ProviderKey }[]>`
      select provider
      from integrations
      where id = ${integrationId} and "workspaceId" = ${workspaceId}
      for update
    `;
    const integration = integrations[0];

    if (integration === undefined) {
      throw new RepositoryError("not_found", "Integration not found.");
    }

    const identities = new Set<string>();

    for (const scope of scopes) {
      const identity = `${scope.scopeKey}\u0000${scope.externalId}`;

      if (
        !integrationKeyBelongsToProvider(scope.scopeKey, integration.provider)
      ) {
        throw new RepositoryError(
          "invalid",
          "The scope key does not match the integration provider.",
        );
      }

      if (identities.has(identity)) {
        throw new RepositoryError("invalid", "Duplicate integration scope.");
      }

      identities.add(identity);
    }

    await transaction`
      delete from integration_scopes
      where "workspaceId" = ${workspaceId} and "integrationId" = ${integrationId}
    `;

    const selected: IntegrationScope[] = [];

    for (const scope of scopes) {
      const rows = await transaction<IntegrationScope[]>`
        insert into integration_scopes (
          id,
          "workspaceId",
          "integrationId",
          "scopeKey",
          "externalId",
          "displayName",
          "createdByMembershipId"
        ) values (
          ${createProductId()},
          ${workspaceId},
          ${integrationId},
          ${scope.scopeKey},
          ${scope.externalId},
          ${scope.displayName.trim()},
          ${ownerMembershipId}
        )
        returning *
      `;
      selected.push(requireReturnedRow(rows[0]));
    }

    return selected;
  });
}

export async function listIntegrationScopes(
  database: DatabaseClient,
  workspaceId: string,
  integrationId: string,
  membershipId: string,
): Promise<IntegrationScope[]> {
  await requireMembership(database, workspaceId, membershipId);

  return database<IntegrationScope[]>`
    select *
    from integration_scopes
    where "workspaceId" = ${workspaceId} and "integrationId" = ${integrationId}
    order by "displayName", id
  `;
}

export async function listWorkspaceIntegrations(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
): Promise<Integration[]> {
  await requireMembership(database, workspaceId, membershipId);

  return database<Integration[]>`
    select *
    from integrations
    where "workspaceId" = ${workspaceId}
    order by provider
  `;
}

export async function findIntegrationAccountForMember(
  database: DatabaseClient,
  workspaceId: string,
  integrationId: string,
  membershipId: string,
): Promise<IntegrationAccount | null> {
  await requireMembership(database, workspaceId, membershipId);
  const rows = await database<IntegrationAccount[]>`
    select *
    from integration_accounts
    where
      "workspaceId" = ${workspaceId}
      and "integrationId" = ${integrationId}
      and "membershipId" = ${membershipId}
  `;

  return rows[0] ?? null;
}
