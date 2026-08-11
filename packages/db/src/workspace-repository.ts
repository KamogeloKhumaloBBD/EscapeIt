import type { DatabaseClient } from "./client";
import { withTransaction } from "./client";
import type {
  ActivityEvent,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMembership,
} from "./domain";
import { RepositoryError } from "./repository-errors";
import {
  createProductId,
  normalizeEmail,
  requireMembership,
  requireOwner,
  requireReturnedRow,
  requireSha256Digest,
} from "./repository-helpers";

export interface CreateWorkspaceInput {
  correlationId: string;
  name: string;
  userId: string;
}

export interface CreateWorkspaceResult {
  membership: WorkspaceMembership;
  workspace: Workspace;
}

export interface CurrentWorkspace {
  membership: WorkspaceMembership;
  workspace: Workspace;
}

export interface WorkspaceOverview extends CurrentWorkspace {
  activeMcpTokenCount: number;
  connectedIntegrationCount: number;
  memberCount: number;
  recentActivity: ActivityEvent[];
}

export interface CreateInvitationInput {
  correlationId: string;
  email: string;
  expiresAt: Date;
  invitedByMembershipId: string;
  tokenHash: Uint8Array;
  workspaceId: string;
}

export interface AcceptInvitationInput {
  correlationId: string;
  tokenHash: Uint8Array;
  userId: string;
}

export interface WorkspaceMemberSummary {
  email: string;
  joinedAt: Date;
  membershipId: string;
  name: string;
  role: WorkspaceMembership["role"];
}

export interface WorkspaceInvitationPreview extends WorkspaceInvitation {
  inviterName: string;
  workspaceName: string;
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

  if (input.correlationId.length < 1 || input.correlationId.length > 128) {
    throw new RepositoryError("invalid", "The correlation ID is invalid.");
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
    const membership = requireReturnedRow(memberships[0]);

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
        summary
      ) values (
        ${createProductId()},
        ${workspaceId},
        ${membershipId},
        ${membershipId},
        ${input.correlationId},
        'workspace',
        'succeeded',
        'workspace.create',
        'Workspace created'
      )
    `;

    return {
      membership,
      workspace: requireReturnedRow(workspaces[0]),
    };
  });
}

export async function findCurrentWorkspaceForUser(
  database: DatabaseClient,
  userId: string,
): Promise<CurrentWorkspace | null> {
  const rows = await database<
    {
      membershipCreatedAt: Date;
      membershipId: string;
      membershipRole: WorkspaceMembership["role"];
      membershipUpdatedAt: Date;
      workspaceCreatedAt: Date;
      workspaceCreatedByUserId: string | null;
      workspaceId: string;
      workspaceName: string;
      workspaceUpdatedAt: Date;
    }[]
  >`
    select
      membership.id as "membershipId",
      membership.role as "membershipRole",
      membership."createdAt" as "membershipCreatedAt",
      membership."updatedAt" as "membershipUpdatedAt",
      workspace.id as "workspaceId",
      workspace.name as "workspaceName",
      workspace."createdByUserId" as "workspaceCreatedByUserId",
      workspace."createdAt" as "workspaceCreatedAt",
      workspace."updatedAt" as "workspaceUpdatedAt"
    from workspace_memberships membership
    join workspaces workspace on workspace.id = membership."workspaceId"
    where membership."userId" = ${userId}
  `;
  const row = rows[0];

  if (row === undefined) {
    return null;
  }

  return {
    membership: {
      createdAt: row.membershipCreatedAt,
      id: row.membershipId,
      role: row.membershipRole,
      updatedAt: row.membershipUpdatedAt,
      userId,
      workspaceId: row.workspaceId,
    },
    workspace: {
      createdAt: row.workspaceCreatedAt,
      createdByUserId: row.workspaceCreatedByUserId,
      id: row.workspaceId,
      name: row.workspaceName,
      updatedAt: row.workspaceUpdatedAt,
    },
  };
}

export async function getWorkspaceOverviewForUser(
  database: DatabaseClient,
  userId: string,
  recentActivityLimit = 5,
): Promise<WorkspaceOverview | null> {
  if (
    !Number.isInteger(recentActivityLimit) ||
    recentActivityLimit < 1 ||
    recentActivityLimit > 20
  ) {
    throw new RepositoryError(
      "invalid",
      "The recent activity limit must be between 1 and 20.",
    );
  }

  const current = await findCurrentWorkspaceForUser(database, userId);

  if (current === null) {
    return null;
  }

  return withTransaction(database, async (transaction) => {
    const [counts] = await transaction<
      {
        activeMcpTokenCount: number;
        connectedIntegrationCount: number;
        memberCount: number;
      }[]
    >`
      select
        (
          select count(*)::integer
          from workspace_memberships
          where "workspaceId" = ${current.workspace.id}
        ) as "memberCount",
        (
          select count(*)::integer
          from integrations
          where
            "workspaceId" = ${current.workspace.id}
            and status = 'connected'
        ) as "connectedIntegrationCount",
        (
          select count(*)::integer
          from mcp_tokens
          where
            "workspaceId" = ${current.workspace.id}
            and "revokedAt" is null
            and ("expiresAt" is null or "expiresAt" > now())
        ) as "activeMcpTokenCount"
    `;
    const recentActivity = await transaction<ActivityEvent[]>`
      select *
      from activity_events
      where "workspaceId" = ${current.workspace.id}
      order by "occurredAt" desc, id desc
      limit ${recentActivityLimit}
    `;
    const overviewCounts = requireReturnedRow(counts);

    return {
      ...current,
      ...overviewCounts,
      recentActivity,
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

    await transaction`
      update workspace_invitations
      set "revokedAt" = now()
      where
        "workspaceId" = ${input.workspaceId}
        and "normalizedEmail" = ${normalizedEmail}
        and "acceptedAt" is null
        and "revokedAt" is null
        and "expiresAt" <= now()
    `;

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
      on conflict do nothing
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

    if (invitations[0] === undefined) {
      throw new RepositoryError(
        "conflict",
        "A pending invitation already exists for this email address.",
      );
    }

    await transaction`
      insert into activity_events (
        id,
        "workspaceId",
        "actorMembershipId",
        "correlationId",
        category,
        status,
        operation,
        summary
      ) values (
        ${createProductId()},
        ${input.workspaceId},
        ${input.invitedByMembershipId},
        ${input.correlationId},
        'workspace',
        'succeeded',
        'workspace.invitation.create',
        'Workspace invitation created'
      )
    `;

    return invitations[0];
  });
}

export async function listWorkspaceMembers(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
): Promise<WorkspaceMemberSummary[]> {
  await requireMembership(database, workspaceId, membershipId);

  return database<WorkspaceMemberSummary[]>`
    select
      membership.id as "membershipId",
      membership.role,
      membership."createdAt" as "joinedAt",
      users.name,
      users.email
    from workspace_memberships membership
    join users on users.id = membership."userId"
    where membership."workspaceId" = ${workspaceId}
    order by
      case when membership.role = 'owner' then 0 else 1 end,
      lower(users.name),
      membership.id
  `;
}

export async function listPendingWorkspaceInvitations(
  database: DatabaseClient,
  workspaceId: string,
  ownerMembershipId: string,
): Promise<WorkspaceInvitation[]> {
  await requireOwner(database, workspaceId, ownerMembershipId);

  return database<WorkspaceInvitation[]>`
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
    where
      "workspaceId" = ${workspaceId}
      and "acceptedAt" is null
      and "revokedAt" is null
      and "expiresAt" > now()
    order by "createdAt" desc, id desc
  `;
}

export async function findWorkspaceInvitationByToken(
  database: DatabaseClient,
  tokenHash: Uint8Array,
): Promise<WorkspaceInvitationPreview | null> {
  const digest = requireSha256Digest(tokenHash);
  const rows = await database<WorkspaceInvitationPreview[]>`
    select
      invitation.id,
      invitation."workspaceId",
      invitation."normalizedEmail",
      invitation."invitedByMembershipId",
      invitation."acceptedByMembershipId",
      invitation."expiresAt",
      invitation."acceptedAt",
      invitation."revokedAt",
      invitation."createdAt",
      workspace.name as "workspaceName",
      inviter.name as "inviterName"
    from workspace_invitations invitation
    join workspaces workspace on workspace.id = invitation."workspaceId"
    join workspace_memberships inviter_membership
      on inviter_membership.id = invitation."invitedByMembershipId"
      and inviter_membership."workspaceId" = invitation."workspaceId"
    join users inviter on inviter.id = inviter_membership."userId"
    where invitation."tokenHash" = ${digest}
  `;

  return rows[0] ?? null;
}

export async function revokeWorkspaceInvitation(
  database: DatabaseClient,
  workspaceId: string,
  invitationId: string,
  ownerMembershipId: string,
  correlationId: string,
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

    if (rows[0] !== undefined) {
      await transaction`
        insert into activity_events (
          id,
          "workspaceId",
          "actorMembershipId",
          "correlationId",
          category,
          status,
          operation,
          summary
        ) values (
          ${createProductId()},
          ${workspaceId},
          ${ownerMembershipId},
          ${correlationId},
          'workspace',
          'succeeded',
          'workspace.invitation.revoke',
          'Workspace invitation revoked'
        )
      `;
    }

    return rows[0] !== undefined;
  });
}

export async function markWorkspaceInvitationDeliveryFailed(
  database: DatabaseClient,
  workspaceId: string,
  invitationId: string,
  ownerMembershipId: string,
  correlationId: string,
): Promise<void> {
  await withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    await transaction`
      update workspace_invitations
      set "revokedAt" = coalesce("revokedAt", now())
      where
        id = ${invitationId}
        and "workspaceId" = ${workspaceId}
        and "acceptedAt" is null
    `;
    await transaction`
      insert into activity_events (
        id,
        "workspaceId",
        "actorMembershipId",
        "correlationId",
        category,
        status,
        operation,
        summary
      ) values (
        ${createProductId()},
        ${workspaceId},
        ${ownerMembershipId},
        ${correlationId},
        'workspace',
        'failed',
        'workspace.invitation.delivery',
        'Workspace invitation delivery failed'
      )
    `;
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
        summary
      ) values (
        ${createProductId()},
        ${invitation.workspaceId},
        ${membershipId},
        ${membershipId},
        ${input.correlationId},
        'workspace',
        'succeeded',
        'workspace.invitation.accept',
        'Workspace invitation accepted'
      )
    `;

    return requireReturnedRow(memberships[0]);
  });
}
