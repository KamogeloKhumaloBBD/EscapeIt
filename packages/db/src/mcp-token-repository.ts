import type { DatabaseClient } from "./client";
import { withTransaction } from "./client";
import type { McpToken } from "./domain";
import { RepositoryError } from "./repository-errors";
import {
  createProductId,
  requireOwner,
  requireReturnedRow,
  requireSha256Digest,
} from "./repository-helpers";

export interface CreateMcpTokenInput {
  createdByMembershipId: string;
  expiresAt?: Date | null;
  name: string;
  prefix: string;
  tokenHash: Uint8Array;
  workspaceId: string;
}

export interface ResolvedMcpToken extends McpToken {
  workspaceId: string;
}

export async function createMcpToken(
  database: DatabaseClient,
  input: CreateMcpTokenInput,
): Promise<McpToken> {
  const tokenHash = requireSha256Digest(input.tokenHash);

  if (
    input.expiresAt !== undefined &&
    input.expiresAt !== null &&
    input.expiresAt.getTime() <= Date.now()
  ) {
    throw new RepositoryError("invalid", "Token expiry must be in the future.");
  }

  return withTransaction(database, async (transaction) => {
    await requireOwner(
      transaction,
      input.workspaceId,
      input.createdByMembershipId,
    );
    const rows = await transaction<McpToken[]>`
      insert into mcp_tokens (
        id,
        "workspaceId",
        "createdByMembershipId",
        name,
        prefix,
        "tokenHash",
        "expiresAt"
      ) values (
        ${createProductId()},
        ${input.workspaceId},
        ${input.createdByMembershipId},
        ${input.name.trim()},
        ${input.prefix},
        ${tokenHash},
        ${input.expiresAt ?? null}
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

    return requireReturnedRow(rows[0]);
  });
}

export async function resolveMcpToken(
  database: DatabaseClient,
  tokenHash: Uint8Array,
): Promise<ResolvedMcpToken | null> {
  const digest = requireSha256Digest(tokenHash);
  const rows = await database<ResolvedMcpToken[]>`
    update mcp_tokens
    set "lastUsedAt" = now()
    where
      "tokenHash" = ${digest}
      and "revokedAt" is null
      and ("expiresAt" is null or "expiresAt" > now())
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

  return rows[0] ?? null;
}

export async function listMcpTokens(
  database: DatabaseClient,
  workspaceId: string,
  ownerMembershipId: string,
): Promise<McpToken[]> {
  await requireOwner(database, workspaceId, ownerMembershipId);

  return database<McpToken[]>`
    select
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
    from mcp_tokens
    where "workspaceId" = ${workspaceId}
    order by "createdAt" desc, id desc
  `;
}

export async function revokeMcpToken(
  database: DatabaseClient,
  workspaceId: string,
  tokenId: string,
  ownerMembershipId: string,
): Promise<boolean> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const rows = await transaction<{ id: string }[]>`
      update mcp_tokens
      set
        "revokedAt" = now(),
        "revokedByMembershipId" = ${ownerMembershipId}
      where
        id = ${tokenId}
        and "workspaceId" = ${workspaceId}
        and "revokedAt" is null
      returning id
    `;

    return rows[0] !== undefined;
  });
}
