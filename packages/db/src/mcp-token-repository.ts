import type { DatabaseClient } from "./client";
import { withTransaction } from "./client";
import type { McpToken, WorkspaceRole } from "./domain";
import { RepositoryError } from "./repository-errors";
import {
  createProductId,
  requireMembership,
  requireReturnedRow,
  requireSha256Digest,
} from "./repository-helpers";

export interface CreateMcpTokenInput {
  correlationId: string;
  createdByMembershipId: string;
  name: string;
  prefix: string;
  tokenHash: Uint8Array;
  workspaceId: string;
}

export interface McpTokenSummary extends McpToken {
  creatorEmail: string;
  creatorName: string;
}

export interface ResolvedMcpPrincipal {
  membershipId: string;
  role: WorkspaceRole;
  tokenId: string;
  userEmail: string;
  userId: string;
  userName: string;
  workspaceId: string;
  workspaceName: string;
}

function validateCorrelationId(correlationId: string): void {
  if (correlationId.length < 1 || correlationId.length > 128) {
    throw new RepositoryError("invalid", "The correlation ID is invalid.");
  }
}

export async function createMcpToken(
  database: DatabaseClient,
  input: CreateMcpTokenInput,
): Promise<McpToken> {
  const tokenHash = requireSha256Digest(input.tokenHash);
  const name = input.name.trim();
  validateCorrelationId(input.correlationId);

  if (name.length < 1 || name.length > 120) {
    throw new RepositoryError(
      "invalid",
      "Token names must contain between 1 and 120 characters.",
    );
  }

  return withTransaction(database, async (transaction) => {
    await requireMembership(
      transaction,
      input.workspaceId,
      input.createdByMembershipId,
    );
    const tokenId = createProductId();
    const rows = await transaction<McpToken[]>`
      insert into mcp_tokens (
        id,
        "workspaceId",
        "createdByMembershipId",
        name,
        prefix,
        "tokenHash"
      ) values (
        ${tokenId},
        ${input.workspaceId},
        ${input.createdByMembershipId},
        ${name},
        ${input.prefix},
        ${tokenHash}
      )
      returning
        id,
        "workspaceId",
        "createdByMembershipId",
        name,
        prefix,
        "expiresAt",
        "lastUsedAt",
        "revokedAt",
        "revokedByMembershipId",
        "createdAt"
    `;

    await transaction`
      insert into activity_events (
        id,
        "workspaceId",
        "actorMembershipId",
        "subjectMembershipId",
        "correlationId",
        category,
        status,
        operation,
        summary,
        metadata
      ) values (
        ${createProductId()},
        ${input.workspaceId},
        ${input.createdByMembershipId},
        ${input.createdByMembershipId},
        ${input.correlationId},
        'mcp',
        'succeeded',
        'mcp.token.create',
        'Personal MCP token created',
        ${transaction.json({ tokenId })}
      )
    `;

    return requireReturnedRow(rows[0]);
  });
}

export async function resolveMcpToken(
  database: DatabaseClient,
  tokenHash: Uint8Array,
): Promise<ResolvedMcpPrincipal | null> {
  const digest = requireSha256Digest(tokenHash);
  const rows = await database<ResolvedMcpPrincipal[]>`
    update mcp_tokens token
    set "lastUsedAt" = now()
    from
      workspace_memberships membership,
      users app_user,
      workspaces workspace
    where
      token."tokenHash" = ${digest}
      and token."revokedAt" is null
      and (token."expiresAt" is null or token."expiresAt" > now())
      and membership.id = token."createdByMembershipId"
      and membership."workspaceId" = token."workspaceId"
      and app_user.id = membership."userId"
      and workspace.id = token."workspaceId"
    returning
      token.id as "tokenId",
      token."workspaceId" as "workspaceId",
      workspace.name as "workspaceName",
      membership.id as "membershipId",
      membership.role,
      app_user.id as "userId",
      app_user.name as "userName",
      app_user.email as "userEmail"
  `;

  return rows[0] ?? null;
}

export async function listMcpTokens(
  database: DatabaseClient,
  workspaceId: string,
  requestingMembershipId: string,
): Promise<McpTokenSummary[]> {
  const membership = await requireMembership(
    database,
    workspaceId,
    requestingMembershipId,
  );

  return database<McpTokenSummary[]>`
    select
      token.id,
      token."workspaceId",
      token."createdByMembershipId",
      token.name,
      token.prefix,
      token."expiresAt",
      token."lastUsedAt",
      token."revokedAt",
      token."revokedByMembershipId",
      token."createdAt",
      app_user.name as "creatorName",
      app_user.email as "creatorEmail"
    from mcp_tokens token
    join workspace_memberships membership
      on membership.id = token."createdByMembershipId"
      and membership."workspaceId" = token."workspaceId"
    join users app_user on app_user.id = membership."userId"
    where
      token."workspaceId" = ${workspaceId}
      and (
        ${membership.role === "owner"}
        or token."createdByMembershipId" = ${requestingMembershipId}
      )
    order by token."createdAt" desc, token.id desc
  `;
}

export async function revokeMcpToken(
  database: DatabaseClient,
  workspaceId: string,
  tokenId: string,
  requestingMembershipId: string,
  correlationId: string,
): Promise<boolean> {
  validateCorrelationId(correlationId);

  return withTransaction(database, async (transaction) => {
    const requester = await requireMembership(
      transaction,
      workspaceId,
      requestingMembershipId,
    );
    const tokens = await transaction<
      { createdByMembershipId: string; id: string }[]
    >`
      select id, "createdByMembershipId"
      from mcp_tokens
      where id = ${tokenId} and "workspaceId" = ${workspaceId}
      for update
    `;
    const token = tokens[0];

    if (
      token === undefined ||
      (requester.role !== "owner" &&
        token.createdByMembershipId !== requestingMembershipId)
    ) {
      return false;
    }

    const rows = await transaction<{ id: string }[]>`
      update mcp_tokens
      set
        "revokedAt" = now(),
        "revokedByMembershipId" = ${requestingMembershipId}
      where id = ${tokenId} and "workspaceId" = ${workspaceId} and "revokedAt" is null
      returning id
    `;

    if (rows[0] === undefined) {
      return false;
    }

    await transaction`
      insert into activity_events (
        id,
        "workspaceId",
        "actorMembershipId",
        "subjectMembershipId",
        "correlationId",
        category,
        status,
        operation,
        summary,
        metadata
      ) values (
        ${createProductId()},
        ${workspaceId},
        ${requestingMembershipId},
        ${token.createdByMembershipId},
        ${correlationId},
        'mcp',
        'succeeded',
        'mcp.token.revoke',
        'Personal MCP token revoked',
        ${transaction.json({ tokenId })}
      )
    `;

    return true;
  });
}
