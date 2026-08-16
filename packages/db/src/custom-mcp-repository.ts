import type { DatabaseClient } from "./client";
import { withTransaction } from "./client";
import type {
  ConnectionStatus,
  CustomMcpAccount,
  CustomMcpAccountAuthMethod,
  CustomMcpAuthenticationKind,
  CustomMcpServer,
  CustomMcpTool,
  EncryptedCredentialEnvelope,
  JsonObject,
} from "./domain";
import { RepositoryError } from "./repository-errors";
import {
  createProductId,
  requireMembership,
  requireOwner,
  requireReturnedRow,
  requireSha256Digest,
} from "./repository-helpers";

export interface DiscoveredCustomMcpToolInput {
  annotations: JsonObject;
  catalogHash: Uint8Array;
  description: string;
  exposedName: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject | null;
  title: string | null;
  upstreamName: string;
}

export interface CustomMcpServerSummary {
  account: CustomMcpAccount | null;
  server: CustomMcpServer;
}

export interface CustomMcpServerDetail extends CustomMcpServerSummary {
  tools: CustomMcpTool[];
}

export interface ReadyCustomMcpAccess {
  account: CustomMcpAccount | null;
  server: CustomMcpServer;
  tools: CustomMcpTool[];
}

export interface CustomMcpOAuthAttempt {
  accountId: string;
  createdAt: Date;
  credentialEnvelope: EncryptedCredentialEnvelope;
  expiresAt: Date;
  id: string;
  membershipId: string;
  serverId: string;
  stateHash: Uint8Array;
  workspaceId: string;
}

async function attachAccounts(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
  servers: readonly CustomMcpServer[],
): Promise<CustomMcpServerSummary[]> {
  if (servers.length === 0) return [];
  const ids = servers.map((server) => server.id);
  const accounts = await database<CustomMcpAccount[]>`
    select *
    from custom_mcp_accounts
    where
      "workspaceId" = ${workspaceId}
      and "membershipId" = ${membershipId}
      and "serverId" in ${database(ids)}
  `;
  const byServer = new Map(
    accounts.map((account) => [account.serverId, account]),
  );
  return servers.map((server) => ({
    account: byServer.get(server.id) ?? null,
    server,
  }));
}

export async function listCustomMcpServers(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
): Promise<CustomMcpServerSummary[]> {
  await requireMembership(database, workspaceId, membershipId);
  const servers = await database<CustomMcpServer[]>`
    select *
    from custom_mcp_servers
    where "workspaceId" = ${workspaceId} and "archivedAt" is null
    order by name, id
  `;
  return attachAccounts(database, workspaceId, membershipId, servers);
}

export async function findCustomMcpServer(
  database: DatabaseClient,
  workspaceId: string,
  serverId: string,
  membershipId: string,
): Promise<CustomMcpServerDetail | null> {
  await requireMembership(database, workspaceId, membershipId);
  const servers = await database<CustomMcpServer[]>`
    select *
    from custom_mcp_servers
    where id = ${serverId} and "workspaceId" = ${workspaceId} and "archivedAt" is null
  `;
  const server = servers[0];
  if (server === undefined) return null;
  const [summaries, tools] = await Promise.all([
    attachAccounts(database, workspaceId, membershipId, [server]),
    database<CustomMcpTool[]>`
      select *
      from custom_mcp_tools
      where "workspaceId" = ${workspaceId} and "serverId" = ${serverId}
      order by "exposedName", id
    `,
  ]);
  const summary = summaries[0];
  return summary === undefined ? null : { ...summary, tools };
}

export async function createCustomMcpServer(
  database: DatabaseClient,
  input: {
    authenticationKind: CustomMcpAuthenticationKind;
    configuredByMembershipId: string;
    endpointUrl: string;
    name: string;
    slug: string;
    status: ConnectionStatus;
    tools: readonly DiscoveredCustomMcpToolInput[];
    workspaceId: string;
  },
): Promise<CustomMcpServer> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(
      transaction,
      input.workspaceId,
      input.configuredByMembershipId,
    );
    await transaction`
      select id from workspaces where id = ${input.workspaceId} for update
    `;
    const counts = await transaction<{ count: number }[]>`
      select count(*)::int as count
      from custom_mcp_servers
      where "workspaceId" = ${input.workspaceId} and "archivedAt" is null
    `;
    if ((counts[0]?.count ?? 0) >= 10) {
      throw new RepositoryError(
        "conflict",
        "A workspace can have at most 10 active Custom MCP servers.",
      );
    }
    const rows = await transaction<CustomMcpServer[]>`
      insert into custom_mcp_servers (
        id, "workspaceId", name, slug, "endpointUrl", "authenticationKind",
        status, "configuredByMembershipId", "lastValidatedAt"
      ) values (
        ${createProductId()}, ${input.workspaceId}, ${input.name}, ${input.slug},
        ${input.endpointUrl}, ${input.authenticationKind}, ${input.status},
        ${input.configuredByMembershipId},
        ${input.status === "connected" ? new Date() : null}
      )
      returning *
    `;
    const server = requireReturnedRow(rows[0]);
    for (const tool of input.tools) {
      await transaction`
        insert into custom_mcp_tools (
          id, "workspaceId", "serverId", "upstreamName", "exposedName", title,
          description, "inputSchema", "outputSchema", annotations, "catalogHash"
        ) values (
          ${createProductId()}, ${input.workspaceId}, ${server.id},
          ${tool.upstreamName}, ${tool.exposedName}, ${tool.title},
          ${tool.description}, ${transaction.json(tool.inputSchema)},
          ${tool.outputSchema === null ? null : transaction.json(tool.outputSchema)},
          ${transaction.json(tool.annotations)}, ${requireSha256Digest(tool.catalogHash)}
        )
      `;
    }
    return server;
  });
}

export async function renameCustomMcpServer(
  database: DatabaseClient,
  workspaceId: string,
  serverId: string,
  ownerMembershipId: string,
  name: string,
): Promise<CustomMcpServer> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const rows = await transaction<CustomMcpServer[]>`
      update custom_mcp_servers
      set name = ${name}, "updatedAt" = now()
      where id = ${serverId} and "workspaceId" = ${workspaceId} and "archivedAt" is null
      returning *
    `;
    if (rows[0] === undefined) {
      throw new RepositoryError("not_found", "Custom MCP server not found.");
    }
    return rows[0];
  });
}

export async function ensureCustomMcpAccount(
  database: DatabaseClient,
  input: {
    authMethod: CustomMcpAccountAuthMethod;
    membershipId: string;
    serverId: string;
    workspaceId: string;
  },
): Promise<CustomMcpAccount> {
  return withTransaction(database, async (transaction) => {
    await requireMembership(transaction, input.workspaceId, input.membershipId);
    const servers = await transaction<
      { id: string; status: ConnectionStatus }[]
    >`
      select id, status
      from custom_mcp_servers
      where id = ${input.serverId} and "workspaceId" = ${input.workspaceId} and "archivedAt" is null
    `;
    if (servers[0] === undefined) {
      throw new RepositoryError("not_found", "Custom MCP server not found.");
    }
    const rows = await transaction<CustomMcpAccount[]>`
      insert into custom_mcp_accounts (
        id, "workspaceId", "serverId", "membershipId", "authMethod"
      ) values (
        ${createProductId()}, ${input.workspaceId}, ${input.serverId},
        ${input.membershipId}, ${input.authMethod}
      )
      on conflict ("serverId", "membershipId") do update
      set "updatedAt" = now()
      returning *
    `;
    return requireReturnedRow(rows[0]);
  });
}

export async function saveCustomMcpAccountCredentials(
  database: DatabaseClient,
  input: {
    accountId: string;
    authMethod: CustomMcpAccountAuthMethod;
    credentialEnvelope: EncryptedCredentialEnvelope;
    membershipId: string;
    serverId: string;
    workspaceId: string;
  },
): Promise<CustomMcpAccount> {
  const rows = await database<CustomMcpAccount[]>`
    update custom_mcp_accounts
    set
      "authMethod" = ${input.authMethod},
      status = 'connected',
      "credentialEnvelope" = ${input.credentialEnvelope},
      "lastValidatedAt" = now(),
      "lastErrorCode" = null,
      "updatedAt" = now()
    where
      id = ${input.accountId}
      and "workspaceId" = ${input.workspaceId}
      and "serverId" = ${input.serverId}
      and "membershipId" = ${input.membershipId}
    returning *
  `;
  if (rows[0] === undefined) {
    throw new RepositoryError("not_found", "Custom MCP account not found.");
  }
  return rows[0];
}

export async function replaceCustomMcpAccountCredentials(
  database: DatabaseClient,
  input: {
    accountId: string;
    credentialEnvelope: EncryptedCredentialEnvelope;
    expectedEnvelope: EncryptedCredentialEnvelope;
    workspaceId: string;
  },
): Promise<CustomMcpAccount | null> {
  const rows = await database<CustomMcpAccount[]>`
    update custom_mcp_accounts
    set
      status = 'connected',
      "credentialEnvelope" = ${input.credentialEnvelope},
      "lastValidatedAt" = now(),
      "lastErrorCode" = null,
      "updatedAt" = now()
    where
      id = ${input.accountId}
      and "workspaceId" = ${input.workspaceId}
      and "credentialEnvelope" = ${input.expectedEnvelope}
    returning *
  `;
  return rows[0] ?? null;
}

export async function markCustomMcpOAuthAccountAuthenticationError(
  database: DatabaseClient,
  input: {
    accountId: string;
    errorCode: "authorization_expired" | "credentials_unavailable";
    expectedEnvelope: EncryptedCredentialEnvelope;
    membershipId: string;
    serverId: string;
    workspaceId: string;
  },
): Promise<CustomMcpAccount | null> {
  const rows = await database<CustomMcpAccount[]>`
    update custom_mcp_accounts
    set
      status = 'error',
      "lastErrorCode" = ${input.errorCode},
      "updatedAt" = now()
    where
      id = ${input.accountId}
      and "workspaceId" = ${input.workspaceId}
      and "serverId" = ${input.serverId}
      and "membershipId" = ${input.membershipId}
      and "authMethod" = 'oauth'
      and status = 'connected'
      and "credentialEnvelope" = ${input.expectedEnvelope}
    returning *
  `;

  return rows[0] ?? null;
}

export async function disconnectCustomMcpAccount(
  database: DatabaseClient,
  workspaceId: string,
  serverId: string,
  membershipId: string,
): Promise<void> {
  await requireMembership(database, workspaceId, membershipId);
  await database`
    update custom_mcp_accounts
    set
      status = 'disconnected',
      "credentialEnvelope" = null,
      "lastErrorCode" = null,
      "updatedAt" = now()
    where
      "workspaceId" = ${workspaceId}
      and "serverId" = ${serverId}
      and "membershipId" = ${membershipId}
  `;
}

export async function setCustomMcpAccountError(
  database: DatabaseClient,
  workspaceId: string,
  accountId: string,
  errorCode: string,
): Promise<void> {
  await database`
    update custom_mcp_accounts
    set status = 'error', "lastErrorCode" = ${errorCode}, "updatedAt" = now()
    where id = ${accountId} and "workspaceId" = ${workspaceId}
  `;
}

export async function replaceCustomMcpCatalog(
  database: DatabaseClient,
  input: {
    ownerMembershipId: string;
    serverId: string;
    tools: readonly DiscoveredCustomMcpToolInput[];
    workspaceId: string;
  },
): Promise<CustomMcpTool[]> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, input.workspaceId, input.ownerMembershipId);
    const servers = await transaction<{ id: string }[]>`
      select id from custom_mcp_servers
      where id = ${input.serverId} and "workspaceId" = ${input.workspaceId} and "archivedAt" is null
      for update
    `;
    if (servers[0] === undefined) {
      throw new RepositoryError("not_found", "Custom MCP server not found.");
    }
    const names = input.tools.map((tool) => tool.upstreamName);
    if (names.length === 0) {
      await transaction`
        update custom_mcp_tools
        set available = false, enabled = false, "enabledByMembershipId" = null,
          "enabledAt" = null, "updatedAt" = now()
        where "workspaceId" = ${input.workspaceId} and "serverId" = ${input.serverId}
      `;
    } else {
      await transaction`
        update custom_mcp_tools
        set available = false, enabled = false, "enabledByMembershipId" = null,
          "enabledAt" = null, "updatedAt" = now()
        where
          "workspaceId" = ${input.workspaceId}
          and "serverId" = ${input.serverId}
          and "upstreamName" not in ${transaction(names)}
      `;
    }
    for (const tool of input.tools) {
      const hash = requireSha256Digest(tool.catalogHash);
      const existing = await transaction<CustomMcpTool[]>`
        select * from custom_mcp_tools
        where "workspaceId" = ${input.workspaceId}
          and "serverId" = ${input.serverId}
          and "upstreamName" = ${tool.upstreamName}
        for update
      `;
      const current = existing[0];
      if (current === undefined) {
        await transaction`
          insert into custom_mcp_tools (
            id, "workspaceId", "serverId", "upstreamName", "exposedName", title,
            description, "inputSchema", "outputSchema", annotations, "catalogHash"
          ) values (
            ${createProductId()}, ${input.workspaceId}, ${input.serverId},
            ${tool.upstreamName}, ${tool.exposedName}, ${tool.title}, ${tool.description},
            ${transaction.json(tool.inputSchema)},
            ${tool.outputSchema === null ? null : transaction.json(tool.outputSchema)},
            ${transaction.json(tool.annotations)}, ${hash}
          )
        `;
        continue;
      }
      const unchanged = Buffer.from(current.catalogHash).equals(hash);
      await transaction`
        update custom_mcp_tools
        set
          "exposedName" = ${tool.exposedName}, title = ${tool.title},
          description = ${tool.description}, "inputSchema" = ${transaction.json(tool.inputSchema)},
          "outputSchema" = ${tool.outputSchema === null ? null : transaction.json(tool.outputSchema)},
          annotations = ${transaction.json(tool.annotations)}, "catalogHash" = ${hash},
          available = true,
          enabled = ${unchanged ? current.enabled : false},
          "enabledByMembershipId" = ${unchanged ? current.enabledByMembershipId : null},
          "enabledAt" = ${unchanged ? current.enabledAt : null},
          "updatedAt" = now()
        where id = ${current.id} and "workspaceId" = ${input.workspaceId}
      `;
    }
    await transaction`
      update custom_mcp_servers
      set status = 'connected', "lastValidatedAt" = now(), "lastErrorCode" = null,
        "updatedAt" = now()
      where id = ${input.serverId} and "workspaceId" = ${input.workspaceId}
    `;
    return transaction<CustomMcpTool[]>`
      select * from custom_mcp_tools
      where "workspaceId" = ${input.workspaceId} and "serverId" = ${input.serverId}
      order by "exposedName", id
    `;
  });
}

export async function replaceEnabledCustomMcpTools(
  database: DatabaseClient,
  input: {
    ownerMembershipId: string;
    serverId: string;
    toolIds: readonly string[];
    workspaceId: string;
  },
): Promise<CustomMcpTool[]> {
  if (new Set(input.toolIds).size !== input.toolIds.length) {
    throw new RepositoryError(
      "invalid",
      "Duplicate Custom MCP tool selection.",
    );
  }
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, input.workspaceId, input.ownerMembershipId);
    let selected: { id: string }[] = [];
    if (input.toolIds.length > 0) {
      selected = await transaction<{ id: string }[]>`
        select id from custom_mcp_tools
        where
          "workspaceId" = ${input.workspaceId}
          and "serverId" = ${input.serverId}
          and available = true
          and id in ${transaction([...input.toolIds])}
      `;
      if (selected.length !== input.toolIds.length) {
        throw new RepositoryError(
          "invalid",
          "One or more Custom MCP tools are unavailable.",
        );
      }
    }
    await transaction`
      update custom_mcp_tools
      set
        enabled = false, "enabledByMembershipId" = null, "enabledAt" = null,
        "updatedAt" = now()
      where "workspaceId" = ${input.workspaceId} and "serverId" = ${input.serverId}
    `;
    if (selected.length > 0) {
      await transaction`
        update custom_mcp_tools
        set
          enabled = true, "enabledByMembershipId" = ${input.ownerMembershipId},
          "enabledAt" = now(), "updatedAt" = now()
        where "workspaceId" = ${input.workspaceId} and id in ${transaction(selected.map((row) => row.id))}
      `;
    }
    return transaction<CustomMcpTool[]>`
      select * from custom_mcp_tools
      where "workspaceId" = ${input.workspaceId} and "serverId" = ${input.serverId}
      order by "exposedName", id
    `;
  });
}

export async function archiveCustomMcpServer(
  database: DatabaseClient,
  workspaceId: string,
  serverId: string,
  ownerMembershipId: string,
): Promise<void> {
  await withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const rows = await transaction<{ id: string }[]>`
      update custom_mcp_servers
      set status = 'disconnected', "archivedAt" = now(), "updatedAt" = now()
      where id = ${serverId} and "workspaceId" = ${workspaceId} and "archivedAt" is null
      returning id
    `;
    if (rows[0] === undefined) {
      throw new RepositoryError("not_found", "Custom MCP server not found.");
    }
    await transaction`
      update custom_mcp_accounts
      set status = 'disconnected', "credentialEnvelope" = null,
        "lastErrorCode" = null, "updatedAt" = now()
      where "workspaceId" = ${workspaceId} and "serverId" = ${serverId}
    `;
    await transaction`
      delete from integration_bundle_custom_mcp_servers
      where "workspaceId" = ${workspaceId} and "serverId" = ${serverId}
    `;
  });
}

export async function listReadyCustomMcpAccess(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
  allowedServerIds: ReadonlySet<string> | null,
): Promise<ReadyCustomMcpAccess[]> {
  await requireMembership(database, workspaceId, membershipId);
  const servers = await database<CustomMcpServer[]>`
    select * from custom_mcp_servers
    where
      "workspaceId" = ${workspaceId}
      and "archivedAt" is null
      and status = 'connected'
    order by id
  `;
  const filtered =
    allowedServerIds === null
      ? servers
      : servers.filter((server) => allowedServerIds.has(server.id));
  if (filtered.length === 0) return [];
  const ids = filtered.map((server) => server.id);
  const [accounts, tools] = await Promise.all([
    database<CustomMcpAccount[]>`
      select * from custom_mcp_accounts
      where
        "workspaceId" = ${workspaceId}
        and "membershipId" = ${membershipId}
        and status = 'connected'
        and "serverId" in ${database(ids)}
    `,
    database<CustomMcpTool[]>`
      select * from custom_mcp_tools
      where
        "workspaceId" = ${workspaceId}
        and enabled = true
        and available = true
        and "serverId" in ${database(ids)}
      order by "exposedName", id
    `,
  ]);
  const accountByServer = new Map(
    accounts.map((account) => [account.serverId, account]),
  );
  const toolsByServer = new Map<string, CustomMcpTool[]>();
  for (const tool of tools) {
    const list = toolsByServer.get(tool.serverId) ?? [];
    list.push(tool);
    toolsByServer.set(tool.serverId, list);
  }
  return filtered.flatMap((server) => {
    const account = accountByServer.get(server.id) ?? null;
    if (server.authenticationKind !== "none" && account === null) return [];
    return [{ account, server, tools: toolsByServer.get(server.id) ?? [] }];
  });
}

export async function createCustomMcpOAuthAttempt(
  database: DatabaseClient,
  input: {
    accountId: string;
    credentialEnvelope: EncryptedCredentialEnvelope;
    expiresAt: Date;
    id: string;
    membershipId: string;
    serverId: string;
    stateHash: Uint8Array;
    workspaceId: string;
  },
): Promise<CustomMcpOAuthAttempt> {
  await database`delete from custom_mcp_oauth_attempts where "expiresAt" <= now()`;
  const rows = await database<CustomMcpOAuthAttempt[]>`
    insert into custom_mcp_oauth_attempts (
      id, "workspaceId", "serverId", "accountId", "membershipId", "stateHash",
      "credentialEnvelope", "expiresAt"
    ) values (
      ${input.id}, ${input.workspaceId}, ${input.serverId}, ${input.accountId},
      ${input.membershipId}, ${requireSha256Digest(input.stateHash)},
      ${input.credentialEnvelope}, ${input.expiresAt}
    )
    returning *
  `;
  return requireReturnedRow(rows[0]);
}

export async function consumeCustomMcpOAuthAttempt(
  database: DatabaseClient,
  workspaceId: string,
  attemptId: string,
  membershipId: string,
): Promise<CustomMcpOAuthAttempt | null> {
  return withTransaction(database, async (transaction) => {
    const rows = await transaction<CustomMcpOAuthAttempt[]>`
      delete from custom_mcp_oauth_attempts
      where
        id = ${attemptId}
        and "workspaceId" = ${workspaceId}
        and "membershipId" = ${membershipId}
        and "expiresAt" > now()
      returning *
    `;
    return rows[0] ?? null;
  });
}
