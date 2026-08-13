import { createHash } from "node:crypto";

import type { DatabaseClient } from "./client";
import { withTransaction } from "./client";
import type { WorkspaceRole } from "./domain";

export interface ResolvedMcpIdentity {
  membershipId: string;
  role: WorkspaceRole;
  userEmail: string;
  userId: string;
  userName: string;
  workspaceId: string;
  workspaceName: string;
}

export interface ResolvedOAuthAccess {
  clientId: string;
  identity: ResolvedMcpIdentity;
  scopes: string[];
}

export interface McpOAuthConnection {
  authorizedAt: Date;
  clientId: string;
  clientName: string;
  consentId: string;
  workspaceId: string;
  workspaceName: string;
}

function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export async function resolveMcpIdentityForWorkspace(
  database: DatabaseClient,
  userId: string,
  workspaceId: string,
): Promise<ResolvedMcpIdentity | null> {
  const rows = await database<ResolvedMcpIdentity[]>`
    select
      membership.id as "membershipId",
      membership.role,
      users.email as "userEmail",
      users.id as "userId",
      users.name as "userName",
      workspace.id as "workspaceId",
      workspace.name as "workspaceName"
    from workspace_memberships membership
    join users on users.id = membership."userId"
    join workspaces workspace on workspace.id = membership."workspaceId"
    where membership."userId" = ${userId}
      and membership."workspaceId" = ${workspaceId}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function resolveOAuthAccessToken(
  database: DatabaseClient,
  token: string,
): Promise<ResolvedOAuthAccess | null> {
  const rows = await database<
    (ResolvedMcpIdentity & {
      clientDisabled: boolean;
      clientId: string;
      expiresAt: Date;
      scopes: string[];
    })[]
  >`
    select
      access."clientId",
      access."expiresAt",
      access.scopes,
      client.disabled as "clientDisabled",
      membership.id as "membershipId",
      membership.role,
      users.email as "userEmail",
      users.id as "userId",
      users.name as "userName",
      workspace.id as "workspaceId",
      workspace.name as "workspaceName"
    from "oauthAccessToken" access
    join "oauthClient" client on client."clientId" = access."clientId"
    join users on users.id = access."userId"
    join workspace_memberships membership
      on membership."userId" = access."userId"
      and membership."workspaceId" = access."referenceId"
    join workspaces workspace on workspace.id = membership."workspaceId"
    where access.token = ${hashOpaqueToken(token)}
    limit 1
  `;
  const row = rows[0];

  if (
    row === undefined ||
    row.clientDisabled ||
    row.expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  return {
    clientId: row.clientId,
    identity: {
      membershipId: row.membershipId,
      role: row.role,
      userEmail: row.userEmail,
      userId: row.userId,
      userName: row.userName,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
    },
    scopes: row.scopes,
  };
}

export async function listMcpOAuthConnections(
  database: DatabaseClient,
  userId: string,
): Promise<McpOAuthConnection[]> {
  return database<McpOAuthConnection[]>`
    select
      consent.id as "consentId",
      consent."clientId",
      left(coalesce(nullif(client.name, ''), 'MCP client'), 120) as "clientName",
      consent."updatedAt" as "authorizedAt",
      workspace.id as "workspaceId",
      workspace.name as "workspaceName"
    from "oauthConsent" consent
    join "oauthClient" client on client."clientId" = consent."clientId"
    join workspace_memberships membership
      on membership."userId" = consent."userId"
      and membership."workspaceId" = consent."referenceId"
    join workspaces workspace on workspace.id = membership."workspaceId"
    where consent."userId" = ${userId}
    order by consent."createdAt" desc, consent.id desc
  `;
}

export async function findMcpOAuthClient(
  database: DatabaseClient,
  clientId: string,
): Promise<{ clientId: string; clientName: string } | null> {
  const rows = await database<{ clientId: string; clientName: string }[]>`
    select
      "clientId",
      left(coalesce(nullif(name, ''), 'MCP client'), 120) as "clientName"
    from "oauthClient"
    where "clientId" = ${clientId}
      and disabled = false
    limit 1
  `;

  return rows[0] ?? null;
}

export async function revokeMcpOAuthConnection(
  database: DatabaseClient,
  userId: string,
  consentId: string,
): Promise<boolean> {
  return withTransaction(database, async (transaction) => {
    const consents = await transaction<
      { clientId: string; referenceId: string | null }[]
    >`
      select "clientId", "referenceId"
      from "oauthConsent"
      where id = ${consentId}
        and "userId" = ${userId}
      for update
    `;
    const consent = consents[0];

    if (consent === undefined) {
      return false;
    }

    await transaction`
      delete from "oauthAccessToken"
      where "userId" = ${userId}
        and "clientId" = ${consent.clientId}
        and "referenceId" is not distinct from ${consent.referenceId}
    `;
    await transaction`
      delete from "oauthRefreshToken"
      where "userId" = ${userId}
        and "clientId" = ${consent.clientId}
        and "referenceId" is not distinct from ${consent.referenceId}
    `;
    await transaction`
      delete from "oauthConsent"
      where id = ${consentId}
        and "userId" = ${userId}
    `;

    return true;
  });
}
