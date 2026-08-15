import type { DatabaseClient } from "./client";
import type {
  ActivityCategory,
  ActivityCursor,
  ActivityEvent,
  ActivityPage,
  ActivityStatus,
  JsonObject,
  ProviderKey,
} from "./domain";
import { RepositoryError } from "./repository-errors";
import { createProductId, requireMembership } from "./repository-helpers";

export interface AppendActivityEventInput {
  actorMembershipId?: string | null;
  category: ActivityCategory;
  correlationId: string;
  externalEventId?: string | null;
  metadata?: JsonObject;
  occurredAt?: Date;
  operation: string;
  parentEventId?: string | null;
  provider?: ProviderKey | null;
  status: ActivityStatus;
  subjectMembershipId?: string | null;
  summary: string;
  workspaceId: string;
}

export interface ListWorkspaceDigestEventsInput {
  periodEnd: Date;
  periodStart: Date;
  workspaceId: string;
}

export interface ListActivityInput {
  cursor?: ActivityCursor | null;
  limit?: number;
  membershipId: string;
  workspaceId: string;
}

export async function appendActivityEvent(
  database: DatabaseClient,
  input: AppendActivityEventInput,
): Promise<ActivityEvent> {
  if (input.externalEventId !== undefined && input.externalEventId !== null) {
    if (input.provider === undefined || input.provider === null) {
      throw new RepositoryError(
        "invalid",
        "External activity events require a provider.",
      );
    }
  }

  const rows = await database<ActivityEvent[]>`
    insert into activity_events (
      id,
      "workspaceId",
      "actorMembershipId",
      "subjectMembershipId",
      "parentEventId",
      "correlationId",
      category,
      status,
      provider,
      operation,
      summary,
      metadata,
      "externalEventId",
      "occurredAt"
    ) values (
      ${createProductId()},
      ${input.workspaceId},
      ${input.actorMembershipId ?? null},
      ${input.subjectMembershipId ?? null},
      ${input.parentEventId ?? null},
      ${input.correlationId},
      ${input.category},
      ${input.status},
      ${input.provider ?? null},
      ${input.operation},
      ${input.summary},
      ${database.json(input.metadata ?? {})},
      ${input.externalEventId ?? null},
      ${input.occurredAt ?? new Date()}
    )
    on conflict do nothing
    returning *
  `;
  const created = rows[0];

  if (created !== undefined) {
    return created;
  }

  if (
    input.externalEventId === undefined ||
    input.externalEventId === null ||
    input.provider === undefined ||
    input.provider === null
  ) {
    throw new RepositoryError("conflict", "Activity event already exists.");
  }

  const existing = await database<ActivityEvent[]>`
    select *
    from activity_events
    where
      "workspaceId" = ${input.workspaceId}
      and provider = ${input.provider}
      and "externalEventId" = ${input.externalEventId}
  `;
  const event = existing[0];

  if (event === undefined) {
    throw new RepositoryError("conflict", "Activity event already exists.");
  }

  return event;
}

/**
 * Events a digest is built from. Deliberately only the `webhook` category:
 * every other category records the workspace administering itself — accounts
 * connected, scopes changed, channels created — which is noise in a digest
 * about what the team actually did.
 *
 * Unlike the other reads here this one takes no membership, because a scheduled
 * digest has no acting member. Callers must therefore establish the workspace
 * themselves rather than accepting one from a request.
 */
export async function listWorkspaceDigestEvents(
  database: DatabaseClient,
  input: ListWorkspaceDigestEventsInput,
): Promise<ActivityEvent[]> {
  return database<ActivityEvent[]>`
    select *
    from activity_events
    where
      "workspaceId" = ${input.workspaceId}
      and category = 'webhook'
      and status = 'succeeded'
      and "occurredAt" >= ${input.periodStart}
      and "occurredAt" < ${input.periodEnd}
    order by "occurredAt", id
  `;
}

/**
 * Workspaces with something worth sending in the window. Returning only these
 * keeps the scheduled run proportional to activity rather than to how many
 * workspaces exist, which matters because each digest costs real inference time.
 */
export async function listWorkspacesWithDigestActivity(
  database: DatabaseClient,
  periodStart: Date,
  periodEnd: Date,
): Promise<string[]> {
  const rows = await database<{ workspaceId: string }[]>`
    select distinct "workspaceId"
    from activity_events
    where
      category = 'webhook'
      and status = 'succeeded'
      and "occurredAt" >= ${periodStart}
      and "occurredAt" < ${periodEnd}
    order by "workspaceId"
  `;

  return rows.map((row) => row.workspaceId);
}

export async function listActivityByCorrelationId(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
  correlationId: string,
): Promise<ActivityEvent[]> {
  await requireMembership(database, workspaceId, membershipId);

  return database<ActivityEvent[]>`
    select *
    from activity_events
    where "workspaceId" = ${workspaceId} and "correlationId" = ${correlationId}
    order by "occurredAt", id
  `;
}

export async function listActivity(
  database: DatabaseClient,
  input: ListActivityInput,
): Promise<ActivityPage> {
  await requireMembership(database, input.workspaceId, input.membershipId);
  const limit = input.limit ?? 50;

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RepositoryError(
      "invalid",
      "Activity page size must be between 1 and 100.",
    );
  }

  const requested = limit + 1;
  const rows =
    input.cursor === undefined || input.cursor === null
      ? await database<ActivityEvent[]>`
          select *
          from activity_events
          where "workspaceId" = ${input.workspaceId}
          order by "occurredAt" desc, id desc
          limit ${requested}
        `
      : await database<ActivityEvent[]>`
          select *
          from activity_events
          where
            "workspaceId" = ${input.workspaceId}
            and ("occurredAt", id) < (${input.cursor.occurredAt}, ${input.cursor.id})
          order by "occurredAt" desc, id desc
          limit ${requested}
        `;
  const hasNextPage = rows.length > limit;
  const events = hasNextPage ? rows.slice(0, limit) : rows;
  const lastEvent = events.at(-1);

  return {
    events,
    nextCursor:
      hasNextPage && lastEvent !== undefined
        ? { id: lastEvent.id, occurredAt: lastEvent.occurredAt }
        : null,
  };
}
