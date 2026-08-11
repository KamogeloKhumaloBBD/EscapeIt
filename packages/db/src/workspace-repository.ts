import type { DatabaseClient } from "./client.js";
import { withTransaction } from "./client.js";
import type {
  Workspace,
  WorkspaceInvitation,
  WorkspaceMembership,
} from "./domain.js";
import { RepositoryError } from "./repository-errors.js";
import {
  createProductId,
  normalizeEmail,
  requireOwner,
  requireReturnedRow,
  requireSha256Digest,
} from "./repository-helpers.js";

export interface CreateWorkspaceInput {
  name: string;
  userId: string;
}

export interface CreateWorkspaceResult {
  membership: WorkspaceMembership;
  workspace: Workspace;
}

export interface CreateInvitationInput {
  email: string;
  expiresAt: Date;
  invitedByMembershipId: string;
  tokenHash: Uint8Array;
  workspaceId: string;
}

export interface AcceptInvitationInput {
  tokenHash: Uint8Array;
  userId: string;
}

export async function createWorkspaceForUser(
  database: DatabaseClient,
  input: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  const name = input.name.trim();

  if (name.length < 1 || name.length > 120) {
    throw new RepositoryError(
      "invalid",
      "Workspace names must contain between 1 and 120 characters.",
    );
  }

  return withTransaction(database, async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`;

    const users = await transaction<{ id: string }[]>`
      select id from users where id = ${input.userId}
    `;

    if (users[0] === undefined) {
      throw new RepositoryError("not_found", "User not found.");
    }

    const existing = await transaction<{ id: string }[]>`
      select id from workspace_memberships where "userId" = ${input.userId}
    `;

    if (existing[0] !== undefined) {
      throw new RepositoryError(
        "conflict",
        "The user already belongs to a workspace.",
      );
    }

    const workspaceId = createProductId();
    const membershipId = createProductId();
    const workspaces = await transaction<Workspace[]>`
      insert into workspaces (id, name, "createdByUserId")
      values (${workspaceId}, ${name}, ${input.userId})
      returning *
    `;
    const memberships = await transaction<WorkspaceMembership[]>`
      insert into workspace_memberships (
        id,
        "workspaceId",
        "userId",
        role
      ) values (
        ${membershipId},
        ${workspaceId},
        ${input.userId},
        'owner'
      )
      returning *
    `;

    return {
      membership: requireReturnedRow(memberships[0]),
      workspace: requireReturnedRow(workspaces[0]),
    };
  });
}

export async function findMembershipForUser(
  database: DatabaseClient,
  userId: string,
): Promise<WorkspaceMembership | null> {
  const rows = await database<WorkspaceMembership[]>`
    select *
    from workspace_memberships
    where "userId" = ${userId}
  `;

  return rows[0] ?? null;
}

export async function createWorkspaceInvitation(
  database: DatabaseClient,
  input: CreateInvitationInput,
): Promise<WorkspaceInvitation> {
  const normalizedEmail = normalizeEmail(input.email);
  const tokenHash = requireSha256Digest(input.tokenHash);

  if (normalizedEmail.length < 3 || normalizedEmail.length > 320) {
    throw new RepositoryError("invalid", "The invitation email is invalid.");
  }

  if (input.expiresAt.getTime() <= Date.now()) {
    throw new RepositoryError(
      "invalid",
      "The invitation expiry must be in the future.",
    );
  }

  return withTransaction(database, async (transaction) => {
    await requireOwner(
      transaction,
      input.workspaceId,
      input.invitedByMembershipId,
    );

    const existingMember = await transaction<{ id: string }[]>`
      select membership.id
      from users
      join workspace_memberships membership on membership."userId" = users.id
      where lower(users.email) = ${normalizedEmail}
    `;

    if (existingMember[0] !== undefined) {
      throw new RepositoryError(
        "conflict",
        "The invited user already belongs to a workspace.",
      );
    }

    const invitations = await transaction<WorkspaceInvitation[]>`
      insert into workspace_invitations (
        id,
        "workspaceId",
        "normalizedEmail",
        "tokenHash",
        "invitedByMembershipId",
        "expiresAt"
      ) values (
        ${createProductId()},
        ${input.workspaceId},
        ${normalizedEmail},
        ${tokenHash},
        ${input.invitedByMembershipId},
        ${input.expiresAt}
      )
      returning
        id,
        "workspaceId",
        "normalizedEmail",
        "invitedByMembershipId",
        "acceptedByMembershipId",
        "expiresAt",
        "acceptedAt",
        "revokedAt",
        "createdAt"
    `;

    return requireReturnedRow(invitations[0]);
  });
}

export async function revokeWorkspaceInvitation(
  database: DatabaseClient,
  workspaceId: string,
  invitationId: string,
  ownerMembershipId: string,
): Promise<boolean> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const rows = await transaction<{ id: string }[]>`
      update workspace_invitations
      set "revokedAt" = now()
      where
        id = ${invitationId}
        and "workspaceId" = ${workspaceId}
        and "acceptedAt" is null
        and "revokedAt" is null
      returning id
    `;

    return rows[0] !== undefined;
  });
}

export async function acceptWorkspaceInvitation(
  database: DatabaseClient,
  input: AcceptInvitationInput,
): Promise<WorkspaceMembership> {
  const tokenHash = requireSha256Digest(input.tokenHash);

  return withTransaction(database, async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`;

    const users = await transaction<{ email: string }[]>`
      select email from users where id = ${input.userId}
    `;
    const user = users[0];

    if (user === undefined) {
      throw new RepositoryError("not_found", "User not found.");
    }

    const invitations = await transaction<WorkspaceInvitation[]>`
      select
        id,
        "workspaceId",
        "normalizedEmail",
        "invitedByMembershipId",
        "acceptedByMembershipId",
        "expiresAt",
        "acceptedAt",
        "revokedAt",
        "createdAt"
      from workspace_invitations
      where "tokenHash" = ${tokenHash}
      for update
    `;
    const invitation = invitations[0];

    if (invitation === undefined) {
      throw new RepositoryError("not_found", "Invitation not found.");
    }

    if (
      invitation.acceptedAt !== null ||
      invitation.revokedAt !== null ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new RepositoryError(
        "conflict",
        "The invitation is no longer active.",
      );
    }

    if (normalizeEmail(user.email) !== invitation.normalizedEmail) {
      throw new RepositoryError(
        "forbidden",
        "The invitation belongs to a different user.",
      );
    }

    const existing = await transaction<{ id: string }[]>`
      select id from workspace_memberships where "userId" = ${input.userId}
    `;

    if (existing[0] !== undefined) {
      throw new RepositoryError(
        "conflict",
        "The user already belongs to a workspace.",
      );
    }

    const membershipId = createProductId();
    const memberships = await transaction<WorkspaceMembership[]>`
      insert into workspace_memberships (
        id,
        "workspaceId",
        "userId",
        role
      ) values (
        ${membershipId},
        ${invitation.workspaceId},
        ${input.userId},
        'member'
      )
      returning *
    `;

    await transaction`
      update workspace_invitations
      set
        "acceptedAt" = now(),
        "acceptedByMembershipId" = ${membershipId}
      where id = ${invitation.id}
    `;
    await transaction`
      update workspace_invitations
      set "revokedAt" = now()
      where
        id <> ${invitation.id}
        and "normalizedEmail" = ${invitation.normalizedEmail}
        and "acceptedAt" is null
        and "revokedAt" is null
    `;

    return requireReturnedRow(memberships[0]);
  });
}
