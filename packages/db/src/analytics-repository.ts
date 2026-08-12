import type { DatabaseClient, DatabaseTransaction } from "./client";
import { withTransaction } from "./client";
import type { ActivityStatus, ProviderKey } from "./domain";
import { parseProviderKey } from "./domain";
import { RepositoryError } from "./repository-errors";
import { requireMembership } from "./repository-helpers";

export interface AnalyticsRange {
  endExclusive: string;
  start: string;
}

export interface WorkspaceAnalyticsInput {
  comparison: AnalyticsRange;
  membershipId: string;
  provider?: ProviderKey | null;
  range: AnalyticsRange;
  selectedMembershipId?: string | null;
  timeZone: string;
  workspaceId: string;
}

export type AnalyticsRankingSort = "calls" | "failures" | "success-rate";
export type AnalyticsSortDirection = "asc" | "desc";

export interface WorkspaceAnalyticsRankingInput {
  direction: AnalyticsSortDirection;
  limit: number;
  membershipId: string;
  offset: number;
  provider?: ProviderKey | null;
  query: string;
  range: AnalyticsRange;
  selectedMembershipId?: string | null;
  sort: AnalyticsRankingSort;
  timeZone: string;
  workspaceId: string;
}

export interface AnalyticsRankingPage<T> {
  items: T[];
  total: number;
}

export interface UsageSummary {
  activeIntegrationCount: number;
  activeMemberCount: number;
  failedCount: number;
  succeededCount: number;
  toolCallCount: number;
}

export interface DailyUsage {
  date: string;
  failedCount: number;
  succeededCount: number;
  toolCallCount: number;
}

export interface ProviderUsage {
  failedCount: number;
  provider: ProviderKey;
  succeededCount: number;
  toolCallCount: number;
}

export interface ToolUsage extends ProviderUsage {
  toolName: string;
}

export interface MemberUsage {
  email: string;
  failedCount: number;
  lastUsedAt: Date;
  membershipId: string;
  name: string;
  succeededCount: number;
  toolCallCount: number;
}

export interface RecentToolActivity {
  email: string;
  id: string;
  membershipId: string;
  memberName: string;
  occurredAt: Date;
  provider: ProviderKey;
  status: ActivityStatus;
  toolName: string;
}

export interface WorkspaceUsageAnalytics {
  comparison: UsageSummary;
  dailyUsage: DailyUsage[];
  memberUsage: MemberUsage[];
  providerUsage: ProviderUsage[];
  recentActivity: RecentToolActivity[];
  role: "member" | "owner";
  summary: UsageSummary;
  toolUsage: ToolUsage[];
  toolUsageTotal: number;
  memberUsageTotal: number;
}

interface SummaryRow {
  activeIntegrationCount: number;
  activeMemberCount: number;
  failedCount: number;
  succeededCount: number;
  toolCallCount: number;
}

function validateRange(range: AnalyticsRange): void {
  if (range.start >= range.endExclusive) {
    throw new RepositoryError("invalid", "The analytics range is invalid.");
  }
}

function validateRanking(input: WorkspaceAnalyticsRankingInput): void {
  validateRange(input.range);

  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    !Number.isInteger(input.offset) ||
    input.offset < 0 ||
    input.query.length > 120
  ) {
    throw new RepositoryError(
      "invalid",
      "The analytics ranking request is invalid.",
    );
  }
}

interface AnalyticsScopeInput {
  membershipId: string;
  provider?: ProviderKey | null;
  selectedMembershipId?: string | null;
  workspaceId: string;
}

interface AnalyticsScope {
  provider: ProviderKey | null;
  role: "member" | "owner";
  scopedMembershipId: string | null;
}

async function resolveAnalyticsScope(
  transaction: DatabaseTransaction,
  input: AnalyticsScopeInput,
): Promise<AnalyticsScope> {
  const membership = await requireMembership(
    transaction,
    input.workspaceId,
    input.membershipId,
  );
  const provider =
    input.provider === undefined || input.provider === null
      ? null
      : parseProviderKey(input.provider);
  const requestedMembershipId = input.selectedMembershipId ?? null;

  if (provider !== null) {
    const integrations = await transaction<{ id: string }[]>`
      select id
      from integrations
      where "workspaceId" = ${input.workspaceId} and provider = ${provider}
    `;

    if (integrations[0] === undefined) {
      throw new RepositoryError(
        "invalid",
        "The selected integration is invalid.",
      );
    }
  }

  if (
    membership.role === "member" &&
    requestedMembershipId !== null &&
    requestedMembershipId !== input.membershipId
  ) {
    throw new RepositoryError(
      "forbidden",
      "Members may view only their own analytics.",
    );
  }

  if (membership.role === "owner" && requestedMembershipId !== null) {
    const rows = await transaction<{ id: string }[]>`
      select id
      from workspace_memberships
      where
        "workspaceId" = ${input.workspaceId}
        and id = ${requestedMembershipId}
    `;

    if (rows[0] === undefined) {
      throw new RepositoryError(
        "invalid",
        "The selected workspace member is invalid.",
      );
    }
  }

  return {
    provider,
    role: membership.role,
    scopedMembershipId:
      membership.role === "owner" ? requestedMembershipId : input.membershipId,
  };
}

async function readSummary(
  transaction: DatabaseTransaction,
  input: WorkspaceAnalyticsInput,
  range: AnalyticsRange,
  provider: ProviderKey | null,
  scopedMembershipId: string | null,
): Promise<UsageSummary> {
  const rows = await transaction<SummaryRow[]>`
    select
      count(*)::integer as "toolCallCount",
      count(*) filter (where status = 'succeeded')::integer as "succeededCount",
      count(*) filter (where status <> 'succeeded')::integer as "failedCount",
      count(distinct provider)::integer as "activeIntegrationCount",
      count(distinct "subjectMembershipId")::integer as "activeMemberCount"
    from activity_events
    where
      "workspaceId" = ${input.workspaceId}
      and category = 'mcp'
      and operation = 'mcp.tool.complete'
      and status <> 'started'
      and "occurredAt" >= (${range.start}::date::timestamp at time zone ${input.timeZone})
      and "occurredAt" < (${range.endExclusive}::date::timestamp at time zone ${input.timeZone})
      and (${provider}::text is null or provider = ${provider})
      and (
        ${scopedMembershipId}::text is null
        or "subjectMembershipId" = ${scopedMembershipId}
      )
  `;

  return (
    rows[0] ?? {
      activeIntegrationCount: 0,
      activeMemberCount: 0,
      failedCount: 0,
      succeededCount: 0,
      toolCallCount: 0,
    }
  );
}

export async function getWorkspaceUsageAnalytics(
  database: DatabaseClient,
  input: WorkspaceAnalyticsInput,
): Promise<WorkspaceUsageAnalytics> {
  validateRange(input.range);
  validateRange(input.comparison);

  return withTransaction(database, async (transaction) => {
    const scope = await resolveAnalyticsScope(transaction, input);
    const { provider, role, scopedMembershipId } = scope;

    const [summary, comparison, dailyUsage, providerUsage, toolUsageRows] =
      await Promise.all([
        readSummary(
          transaction,
          input,
          input.range,
          provider,
          scopedMembershipId,
        ),
        readSummary(
          transaction,
          input,
          input.comparison,
          provider,
          scopedMembershipId,
        ),
        transaction<DailyUsage[]>`
          with days as (
            select
              ${input.range.start}::date + offsets.day_offset::integer as day
            from generate_series(
              0,
              (${input.range.endExclusive}::date - ${input.range.start}::date) - 1
            ) as offsets(day_offset)
          )
          select
            to_char(days.day, 'YYYY-MM-DD') as date,
            count(events.id)::integer as "toolCallCount",
            count(events.id) filter (where events.status = 'succeeded')::integer as "succeededCount",
            count(events.id) filter (where events.status <> 'succeeded')::integer as "failedCount"
          from days
          left join activity_events events on
            events."workspaceId" = ${input.workspaceId}
            and events.category = 'mcp'
            and events.operation = 'mcp.tool.complete'
            and events.status <> 'started'
            and events."occurredAt" >= (days.day at time zone ${input.timeZone})
            and events."occurredAt" < ((days.day + interval '1 day') at time zone ${input.timeZone})
            and (${provider}::text is null or events.provider = ${provider})
            and (
              ${scopedMembershipId}::text is null
              or events."subjectMembershipId" = ${scopedMembershipId}
            )
          group by days.day
          order by days.day
        `,
        transaction<ProviderUsage[]>`
          select
            provider,
            count(*)::integer as "toolCallCount",
            count(*) filter (where status = 'succeeded')::integer as "succeededCount",
            count(*) filter (where status <> 'succeeded')::integer as "failedCount"
          from activity_events
          where
            "workspaceId" = ${input.workspaceId}
            and category = 'mcp'
            and operation = 'mcp.tool.complete'
            and status <> 'started'
            and provider is not null
            and "occurredAt" >= (${input.range.start}::date::timestamp at time zone ${input.timeZone})
            and "occurredAt" < (${input.range.endExclusive}::date::timestamp at time zone ${input.timeZone})
            and (${provider}::text is null or provider = ${provider})
            and (
              ${scopedMembershipId}::text is null
              or "subjectMembershipId" = ${scopedMembershipId}
            )
          group by provider
          order by "toolCallCount" desc, provider
        `,
        transaction<(ToolUsage & { totalCount: number })[]>`
          select
            provider,
            metadata ->> 'toolName' as "toolName",
            count(*)::integer as "toolCallCount",
            count(*) filter (where status = 'succeeded')::integer as "succeededCount",
            count(*) filter (where status <> 'succeeded')::integer as "failedCount",
            count(*) over()::integer as "totalCount"
          from activity_events
          where
            "workspaceId" = ${input.workspaceId}
            and category = 'mcp'
            and operation = 'mcp.tool.complete'
            and status <> 'started'
            and provider is not null
            and nullif(metadata ->> 'toolName', '') is not null
            and "occurredAt" >= (${input.range.start}::date::timestamp at time zone ${input.timeZone})
            and "occurredAt" < (${input.range.endExclusive}::date::timestamp at time zone ${input.timeZone})
            and (${provider}::text is null or provider = ${provider})
            and (
              ${scopedMembershipId}::text is null
              or "subjectMembershipId" = ${scopedMembershipId}
            )
          group by provider, metadata ->> 'toolName'
          order by "toolCallCount" desc, "toolName"
          limit 5
        `,
      ]);

    const memberUsageRows =
      role === "owner"
        ? await transaction<(MemberUsage & { totalCount: number })[]>`
            select
              memberships.id as "membershipId",
              users.name,
              users.email,
              count(events.id)::integer as "toolCallCount",
              count(events.id) filter (where events.status = 'succeeded')::integer as "succeededCount",
              count(events.id) filter (where events.status <> 'succeeded')::integer as "failedCount",
              max(events."occurredAt") as "lastUsedAt",
              count(*) over()::integer as "totalCount"
            from activity_events events
            join workspace_memberships memberships on
              memberships."workspaceId" = events."workspaceId"
              and memberships.id = events."subjectMembershipId"
            join users on users.id = memberships."userId"
            where
              events."workspaceId" = ${input.workspaceId}
              and events.category = 'mcp'
              and events.operation = 'mcp.tool.complete'
              and events.status <> 'started'
              and events."occurredAt" >= (${input.range.start}::date::timestamp at time zone ${input.timeZone})
              and events."occurredAt" < (${input.range.endExclusive}::date::timestamp at time zone ${input.timeZone})
              and (${provider}::text is null or events.provider = ${provider})
              and (
                ${scopedMembershipId}::text is null
                or events."subjectMembershipId" = ${scopedMembershipId}
              )
            group by memberships.id, users.name, users.email
            order by "toolCallCount" desc, users.name, memberships.id
            limit 5
          `
        : [];
    const toolUsage = toolUsageRows.map(
      ({ totalCount: _totalCount, ...item }) => item,
    );
    const memberUsage = memberUsageRows.map(
      ({ totalCount: _totalCount, ...item }) => item,
    );

    const recentActivity = await transaction<RecentToolActivity[]>`
      select
        events.id,
        events."occurredAt",
        events.provider,
        events.status,
        events.metadata ->> 'toolName' as "toolName",
        memberships.id as "membershipId",
        users.name as "memberName",
        users.email
      from activity_events events
      join workspace_memberships memberships on
        memberships."workspaceId" = events."workspaceId"
        and memberships.id = events."subjectMembershipId"
      join users on users.id = memberships."userId"
      where
        events."workspaceId" = ${input.workspaceId}
        and events.category = 'mcp'
        and events.operation = 'mcp.tool.complete'
        and events.status <> 'started'
        and events.provider is not null
        and nullif(events.metadata ->> 'toolName', '') is not null
        and events."occurredAt" >= (${input.range.start}::date::timestamp at time zone ${input.timeZone})
        and events."occurredAt" < (${input.range.endExclusive}::date::timestamp at time zone ${input.timeZone})
        and (${provider}::text is null or events.provider = ${provider})
        and (
          ${scopedMembershipId}::text is null
          or events."subjectMembershipId" = ${scopedMembershipId}
        )
      order by events."occurredAt" desc, events.id desc
      limit 8
    `;

    return {
      comparison,
      dailyUsage,
      memberUsage,
      providerUsage,
      recentActivity,
      memberUsageTotal: memberUsageRows[0]?.totalCount ?? 0,
      role,
      summary,
      toolUsage,
      toolUsageTotal: toolUsageRows[0]?.totalCount ?? 0,
    };
  });
}

export async function listWorkspaceToolUsage(
  database: DatabaseClient,
  input: WorkspaceAnalyticsRankingInput,
): Promise<AnalyticsRankingPage<ToolUsage>> {
  validateRanking(input);

  return withTransaction(database, async (transaction) => {
    const { provider, scopedMembershipId } = await resolveAnalyticsScope(
      transaction,
      input,
    );
    const search = `%${input.query.trim()}%`;
    const baseWhere = {
      end: input.range.endExclusive,
      provider,
      scopedMembershipId,
      search,
      start: input.range.start,
      timeZone: input.timeZone,
      workspaceId: input.workspaceId,
    };
    const totals = await transaction<{ total: number }[]>`
      select count(*)::integer as total
      from (
        select events.provider, events.metadata ->> 'toolName'
        from activity_events events
        where
          events."workspaceId" = ${baseWhere.workspaceId}
          and events.category = 'mcp'
          and events.operation = 'mcp.tool.complete'
          and events.status <> 'started'
          and events.provider is not null
          and nullif(events.metadata ->> 'toolName', '') is not null
          and events."occurredAt" >= (${baseWhere.start}::date::timestamp at time zone ${baseWhere.timeZone})
          and events."occurredAt" < (${baseWhere.end}::date::timestamp at time zone ${baseWhere.timeZone})
          and (${baseWhere.provider}::text is null or events.provider = ${baseWhere.provider})
          and (
            ${baseWhere.scopedMembershipId}::text is null
            or events."subjectMembershipId" = ${baseWhere.scopedMembershipId}
          )
          and (
            ${input.query.trim()} = ''
            or events.metadata ->> 'toolName' ilike ${baseWhere.search}
            or events.provider ilike ${baseWhere.search}
          )
        group by events.provider, events.metadata ->> 'toolName'
      ) usage
    `;
    const items = await transaction<ToolUsage[]>`
      select
        events.provider,
        events.metadata ->> 'toolName' as "toolName",
        count(*)::integer as "toolCallCount",
        count(*) filter (where events.status = 'succeeded')::integer as "succeededCount",
        count(*) filter (where events.status <> 'succeeded')::integer as "failedCount"
      from activity_events events
      where
        events."workspaceId" = ${baseWhere.workspaceId}
        and events.category = 'mcp'
        and events.operation = 'mcp.tool.complete'
        and events.status <> 'started'
        and events.provider is not null
        and nullif(events.metadata ->> 'toolName', '') is not null
        and events."occurredAt" >= (${baseWhere.start}::date::timestamp at time zone ${baseWhere.timeZone})
        and events."occurredAt" < (${baseWhere.end}::date::timestamp at time zone ${baseWhere.timeZone})
        and (${baseWhere.provider}::text is null or events.provider = ${baseWhere.provider})
        and (
          ${baseWhere.scopedMembershipId}::text is null
          or events."subjectMembershipId" = ${baseWhere.scopedMembershipId}
        )
        and (
          ${input.query.trim()} = ''
          or events.metadata ->> 'toolName' ilike ${baseWhere.search}
          or events.provider ilike ${baseWhere.search}
        )
      group by events.provider, events.metadata ->> 'toolName'
      order by
        case when ${input.sort} = 'calls' and ${input.direction} = 'desc' then count(*) end desc,
        case when ${input.sort} = 'calls' and ${input.direction} = 'asc' then count(*) end asc,
        case when ${input.sort} = 'failures' and ${input.direction} = 'desc' then count(*) filter (where events.status <> 'succeeded') end desc,
        case when ${input.sort} = 'failures' and ${input.direction} = 'asc' then count(*) filter (where events.status <> 'succeeded') end asc,
        case when ${input.sort} = 'success-rate' and ${input.direction} = 'desc'
          then count(*) filter (where events.status = 'succeeded')::numeric / nullif(count(*), 0)
        end desc,
        case when ${input.sort} = 'success-rate' and ${input.direction} = 'asc'
          then count(*) filter (where events.status = 'succeeded')::numeric / nullif(count(*), 0)
        end asc,
        events.metadata ->> 'toolName',
        events.provider
      offset ${input.offset}
      limit ${input.limit}
    `;

    return { items, total: totals[0]?.total ?? 0 };
  });
}

export async function listWorkspaceMemberUsage(
  database: DatabaseClient,
  input: WorkspaceAnalyticsRankingInput,
): Promise<AnalyticsRankingPage<MemberUsage>> {
  validateRanking(input);

  return withTransaction(database, async (transaction) => {
    const scope = await resolveAnalyticsScope(transaction, input);

    if (scope.role !== "owner") {
      throw new RepositoryError(
        "forbidden",
        "Workspace owner access is required for member analytics.",
      );
    }

    const search = `%${input.query.trim()}%`;
    const totals = await transaction<{ total: number }[]>`
      select count(*)::integer as total
      from (
        select memberships.id
        from activity_events events
        join workspace_memberships memberships on
          memberships."workspaceId" = events."workspaceId"
          and memberships.id = events."subjectMembershipId"
        join users on users.id = memberships."userId"
        where
          events."workspaceId" = ${input.workspaceId}
          and events.category = 'mcp'
          and events.operation = 'mcp.tool.complete'
          and events.status <> 'started'
          and events."occurredAt" >= (${input.range.start}::date::timestamp at time zone ${input.timeZone})
          and events."occurredAt" < (${input.range.endExclusive}::date::timestamp at time zone ${input.timeZone})
          and (${scope.provider}::text is null or events.provider = ${scope.provider})
          and (
            ${scope.scopedMembershipId}::text is null
            or events."subjectMembershipId" = ${scope.scopedMembershipId}
          )
          and (
            ${input.query.trim()} = ''
            or users.name ilike ${search}
            or users.email ilike ${search}
          )
        group by memberships.id
      ) usage
    `;
    const items = await transaction<MemberUsage[]>`
      select
        memberships.id as "membershipId",
        users.name,
        users.email,
        count(events.id)::integer as "toolCallCount",
        count(events.id) filter (where events.status = 'succeeded')::integer as "succeededCount",
        count(events.id) filter (where events.status <> 'succeeded')::integer as "failedCount",
        max(events."occurredAt") as "lastUsedAt"
      from activity_events events
      join workspace_memberships memberships on
        memberships."workspaceId" = events."workspaceId"
        and memberships.id = events."subjectMembershipId"
      join users on users.id = memberships."userId"
      where
        events."workspaceId" = ${input.workspaceId}
        and events.category = 'mcp'
        and events.operation = 'mcp.tool.complete'
        and events.status <> 'started'
        and events."occurredAt" >= (${input.range.start}::date::timestamp at time zone ${input.timeZone})
        and events."occurredAt" < (${input.range.endExclusive}::date::timestamp at time zone ${input.timeZone})
        and (${scope.provider}::text is null or events.provider = ${scope.provider})
        and (
          ${scope.scopedMembershipId}::text is null
          or events."subjectMembershipId" = ${scope.scopedMembershipId}
        )
        and (
          ${input.query.trim()} = ''
          or users.name ilike ${search}
          or users.email ilike ${search}
        )
      group by memberships.id, users.name, users.email
      order by
        case when ${input.sort} = 'calls' and ${input.direction} = 'desc' then count(events.id) end desc,
        case when ${input.sort} = 'calls' and ${input.direction} = 'asc' then count(events.id) end asc,
        case when ${input.sort} = 'failures' and ${input.direction} = 'desc' then count(events.id) filter (where events.status <> 'succeeded') end desc,
        case when ${input.sort} = 'failures' and ${input.direction} = 'asc' then count(events.id) filter (where events.status <> 'succeeded') end asc,
        case when ${input.sort} = 'success-rate' and ${input.direction} = 'desc'
          then count(events.id) filter (where events.status = 'succeeded')::numeric / nullif(count(events.id), 0)
        end desc,
        case when ${input.sort} = 'success-rate' and ${input.direction} = 'asc'
          then count(events.id) filter (where events.status = 'succeeded')::numeric / nullif(count(events.id), 0)
        end asc,
        lower(users.name),
        memberships.id
      offset ${input.offset}
      limit ${input.limit}
    `;

    return { items, total: totals[0]?.total ?? 0 };
  });
}
