import type { DatabaseClient } from "./client";
import { withTransaction } from "./client";
import type {
  ConnectionStatus,
  EncryptedCredentialEnvelope,
  Integration,
  IntegrationAccount,
  IntegrationMcpTool,
  IntegrationScope,
  JsonObject,
  ProviderKey,
  ScopeKey,
} from "./domain";
import { integrationKeyBelongsToProvider } from "./domain";
import { RepositoryError } from "./repository-errors";
import {
  createProductId,
  requireMembership,
  requireOwner,
  requireReturnedRow,
} from "./repository-helpers";

export interface ConfigureIntegrationInput {
  clearScopes?: boolean;
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

export interface IntegrationConnectionContext {
  account: IntegrationAccount;
  integration: Integration;
}

export interface ConnectIntegrationAccountWithResourceInput {
  account: SaveIntegrationAccountInput;
  installation: ConfigureIntegrationInput;
}

export interface MemberIntegrationAccess {
  account: IntegrationAccount | null;
  enabledMcpToolNames: string[];
  integration: Integration;
  scopes: IntegrationScope[];
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

    const integration = requireReturnedRow(rows[0]);

    if (input.clearScopes === true) {
      await transaction`
        delete from integration_scopes
        where
          "workspaceId" = ${input.workspaceId}
          and "integrationId" = ${integration.id}
      `;
    }

    return integration;
  });
}

export async function ensureIntegrationAccount(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
  provider: ProviderKey,
): Promise<IntegrationConnectionContext> {
  return withTransaction(database, async (transaction) => {
    const membership = await requireMembership(
      transaction,
      workspaceId,
      membershipId,
    );
    let integrations = await transaction<Integration[]>`
      select *
      from integrations
      where "workspaceId" = ${workspaceId} and provider = ${provider}
      for update
    `;

    if (integrations[0] === undefined) {
      if (membership.role !== "owner") {
        throw new RepositoryError(
          "forbidden",
          "The workspace owner must install this provider first.",
        );
      }

      integrations = await transaction<Integration[]>`
        insert into integrations (
          id,
          "workspaceId",
          provider,
          status,
          configuration,
          "configuredByMembershipId"
        ) values (
          ${createProductId()},
          ${workspaceId},
          ${provider},
          'disconnected',
          ${transaction.json({})},
          ${membershipId}
        )
        returning *
      `;
    }

    const integration = requireReturnedRow(integrations[0]);
    let accounts = await transaction<IntegrationAccount[]>`
      select *
      from integration_accounts
      where
        "workspaceId" = ${workspaceId}
        and "integrationId" = ${integration.id}
        and "membershipId" = ${membershipId}
      for update
    `;

    if (accounts[0] === undefined) {
      accounts = await transaction<IntegrationAccount[]>`
        insert into integration_accounts (
          id,
          "workspaceId",
          "integrationId",
          "membershipId",
          status
        ) values (
          ${createProductId()},
          ${workspaceId},
          ${integration.id},
          ${membershipId},
          'disconnected'
        )
        returning *
      `;
    }

    return {
      account: requireReturnedRow(accounts[0]),
      integration,
    };
  });
}

export async function findWorkspaceIntegration(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
  provider: ProviderKey,
): Promise<Integration | null> {
  await requireMembership(database, workspaceId, membershipId);
  const rows = await database<Integration[]>`
    select *
    from integrations
    where "workspaceId" = ${workspaceId} and provider = ${provider}
  `;

  return rows[0] ?? null;
}

export async function findMemberIntegrationAccess(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
  provider: ProviderKey,
): Promise<MemberIntegrationAccess | null> {
  await requireMembership(database, workspaceId, membershipId);
  const integrations = await database<Integration[]>`
    select *
    from integrations
    where "workspaceId" = ${workspaceId} and provider = ${provider}
  `;
  const integration = integrations[0];

  if (integration === undefined) {
    return null;
  }

  const [accounts, scopes, mcpTools] = await Promise.all([
    database<IntegrationAccount[]>`
      select *
      from integration_accounts
      where
        "workspaceId" = ${workspaceId}
        and "integrationId" = ${integration.id}
        and "membershipId" = ${membershipId}
    `,
    database<IntegrationScope[]>`
      select *
      from integration_scopes
      where
        "workspaceId" = ${workspaceId}
        and "integrationId" = ${integration.id}
      order by "displayName", id
    `,
    database<Pick<IntegrationMcpTool, "toolName">[]>`
      select "toolName"
      from integration_mcp_tools
      where
        "workspaceId" = ${workspaceId}
        and "integrationId" = ${integration.id}
      order by "toolName"
    `,
  ]);

  return {
    account: accounts[0] ?? null,
    enabledMcpToolNames: mcpTools.map((tool) => tool.toolName),
    integration,
    scopes,
  };
}

export async function replaceIntegrationMcpTools(
  database: DatabaseClient,
  workspaceId: string,
  integrationId: string,
  ownerMembershipId: string,
  toolNames: readonly string[],
): Promise<IntegrationMcpTool[]> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const integrations = await transaction<{ id: string }[]>`
      select id
      from integrations
      where id = ${integrationId} and "workspaceId" = ${workspaceId}
      for update
    `;

    if (integrations[0] === undefined) {
      throw new RepositoryError("not_found", "Integration not found.");
    }

    if (new Set(toolNames).size !== toolNames.length) {
      throw new RepositoryError("invalid", "Duplicate MCP tool name.");
    }

    await transaction`
      delete from integration_mcp_tools
      where "workspaceId" = ${workspaceId} and "integrationId" = ${integrationId}
    `;

    const selected: IntegrationMcpTool[] = [];

    for (const toolName of toolNames) {
      const rows = await transaction<IntegrationMcpTool[]>`
        insert into integration_mcp_tools (
          id,
          "workspaceId",
          "integrationId",
          "toolName",
          "enabledByMembershipId"
        ) values (
          ${createProductId()},
          ${workspaceId},
          ${integrationId},
          ${toolName},
          ${ownerMembershipId}
        )
        returning *
      `;
      selected.push(requireReturnedRow(rows[0]));
    }

    return selected;
  });
}

export async function listIntegrationMcpTools(
  database: DatabaseClient,
  workspaceId: string,
  integrationId: string,
  membershipId: string,
): Promise<IntegrationMcpTool[]> {
  await requireMembership(database, workspaceId, membershipId);

  return database<IntegrationMcpTool[]>`
    select *
    from integration_mcp_tools
    where "workspaceId" = ${workspaceId} and "integrationId" = ${integrationId}
    order by "toolName", id
  `;
}

export async function replaceIntegrationAccountCredentials(
  database: DatabaseClient,
  input: SaveIntegrationAccountInput,
  expectedEnvelope: EncryptedCredentialEnvelope,
): Promise<IntegrationAccount | null> {
  validateCredentialState(input);
  await requireMembership(database, input.workspaceId, input.membershipId);
  const rows = await database<IntegrationAccount[]>`
    update integration_accounts
    set
      status = ${input.status},
      "credentialEnvelope" = ${input.credentialEnvelope},
      "lastValidatedAt" = ${input.lastValidatedAt ?? null},
      "lastErrorCode" = ${input.lastErrorCode ?? null},
      "updatedAt" = now()
    where
      id = ${input.accountId}
      and "workspaceId" = ${input.workspaceId}
      and "integrationId" = ${input.integrationId}
      and "membershipId" = ${input.membershipId}
      and "credentialEnvelope" = ${expectedEnvelope}
    returning *
  `;

  return rows[0] ?? null;
}

export async function disconnectIntegrationAccount(
  database: DatabaseClient,
  workspaceId: string,
  integrationId: string,
  membershipId: string,
): Promise<boolean> {
  await requireMembership(database, workspaceId, membershipId);
  const rows = await database<{ id: string }[]>`
    update integration_accounts
    set
      status = 'disconnected',
      "credentialEnvelope" = null,
      "lastValidatedAt" = null,
      "lastErrorCode" = null,
      "updatedAt" = now()
    where
      "workspaceId" = ${workspaceId}
      and "integrationId" = ${integrationId}
      and "membershipId" = ${membershipId}
    returning id
  `;

  return rows[0] !== undefined;
}

export async function markIntegrationAccountValidated(
  database: DatabaseClient,
  workspaceId: string,
  integrationId: string,
  membershipId: string,
): Promise<void> {
  await requireMembership(database, workspaceId, membershipId);
  await database`
    update integration_accounts
    set
      status = 'connected',
      "lastValidatedAt" = now(),
      "lastErrorCode" = null,
      "updatedAt" = now()
    where
      "workspaceId" = ${workspaceId}
      and "integrationId" = ${integrationId}
      and "membershipId" = ${membershipId}
      and "credentialEnvelope" is not null
  `;
}

export async function markWorkspaceIntegrationValidated(
  database: DatabaseClient,
  workspaceId: string,
  integrationId: string,
  ownerMembershipId: string,
): Promise<void> {
  await requireOwner(database, workspaceId, ownerMembershipId);
  await database`
    update integrations
    set
      status = 'connected',
      "lastValidatedAt" = now(),
      "lastErrorCode" = null,
      "updatedAt" = now()
    where id = ${integrationId} and "workspaceId" = ${workspaceId}
  `;
}

export async function disconnectWorkspaceIntegration(
  database: DatabaseClient,
  workspaceId: string,
  integrationId: string,
  ownerMembershipId: string,
): Promise<boolean> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const integrations = await transaction<{ id: string }[]>`
      update integrations
      set
        status = 'disconnected',
        configuration = '{}'::jsonb,
        "lastValidatedAt" = null,
        "lastErrorCode" = null,
        "updatedAt" = now()
      where id = ${integrationId} and "workspaceId" = ${workspaceId}
      returning id
    `;

    if (integrations[0] === undefined) {
      return false;
    }

    await transaction`
      update integration_accounts
      set
        status = 'disconnected',
        "credentialEnvelope" = null,
        "lastValidatedAt" = null,
        "lastErrorCode" = null,
        "updatedAt" = now()
      where "workspaceId" = ${workspaceId} and "integrationId" = ${integrationId}
    `;
    await transaction`
      delete from integration_scopes
      where "workspaceId" = ${workspaceId} and "integrationId" = ${integrationId}
    `;

    return true;
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
        "credentialEnvelope",
        "lastValidatedAt",
        "lastErrorCode"
      ) values (
        ${input.accountId},
        ${input.workspaceId},
        ${input.integrationId},
        ${input.membershipId},
        ${input.status},
        ${input.credentialEnvelope},
        ${input.lastValidatedAt ?? null},
        ${input.lastErrorCode ?? null}
      )
      on conflict ("integrationId", "membershipId") do update set
        status = excluded.status,
        "credentialEnvelope" = excluded."credentialEnvelope",
        "lastValidatedAt" = excluded."lastValidatedAt",
        "lastErrorCode" = excluded."lastErrorCode",
        "updatedAt" = now()
      returning *
    `;

    return requireReturnedRow(rows[0]);
  });
}

export async function connectIntegrationAccountWithResource(
  database: DatabaseClient,
  input: ConnectIntegrationAccountWithResourceInput,
): Promise<IntegrationConnectionContext> {
  validateCredentialState(input.account);

  if (
    input.account.status !== "connected" ||
    input.installation.status !== "connected" ||
    input.account.workspaceId !== input.installation.workspaceId ||
    input.account.membershipId !== input.installation.configuredByMembershipId
  ) {
    throw new RepositoryError(
      "invalid",
      "Account and installation connection state does not match.",
    );
  }

  return withTransaction(database, async (transaction) => {
    await requireOwner(
      transaction,
      input.account.workspaceId,
      input.account.membershipId,
    );
    const integrations = await transaction<Integration[]>`
      update integrations
      set
        status = ${input.installation.status},
        configuration = ${transaction.json(input.installation.configuration)},
        "configuredByMembershipId" = ${input.installation.configuredByMembershipId},
        "lastValidatedAt" = ${input.installation.lastValidatedAt ?? null},
        "lastErrorCode" = ${input.installation.lastErrorCode ?? null},
        "updatedAt" = now()
      where
        id = ${input.account.integrationId}
        and "workspaceId" = ${input.account.workspaceId}
        and provider = ${input.installation.provider}
      returning *
    `;
    const integration = requireReturnedRow(integrations[0]);
    const accounts = await transaction<IntegrationAccount[]>`
      insert into integration_accounts (
        id,
        "workspaceId",
        "integrationId",
        "membershipId",
        status,
        "credentialEnvelope",
        "lastValidatedAt",
        "lastErrorCode"
      ) values (
        ${input.account.accountId},
        ${input.account.workspaceId},
        ${input.account.integrationId},
        ${input.account.membershipId},
        ${input.account.status},
        ${input.account.credentialEnvelope},
        ${input.account.lastValidatedAt ?? null},
        ${input.account.lastErrorCode ?? null}
      )
      on conflict ("integrationId", "membershipId") do update set
        status = excluded.status,
        "credentialEnvelope" = excluded."credentialEnvelope",
        "lastValidatedAt" = excluded."lastValidatedAt",
        "lastErrorCode" = excluded."lastErrorCode",
        "updatedAt" = now()
      returning *
    `;

    return { account: requireReturnedRow(accounts[0]), integration };
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
