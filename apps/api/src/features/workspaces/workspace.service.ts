import type {
  AnalyticsRankingPage,
  AnalyticsRankingSort,
  AnalyticsSortDirection,
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  CurrentWorkspace,
  WorkspaceAnalyticsInput,
  WorkspaceAnalyticsRankingInput,
  WorkspaceOverview,
  WorkspaceUsageAnalytics,
} from "@context-layer/db";
import { RepositoryError } from "@context-layer/db";

import { HttpError } from "../../errors";
import type {
  AnalyticsRankingResponse,
  MemberUsageContract,
  ProviderUsageContract,
  ToolUsageContract,
  UsageSummaryContract,
  WorkspaceAnalyticsResponse,
  WorkspaceOverviewResponse,
  WorkspaceSummary,
} from "./workspace.contracts";
import { parseProviderKey } from "@context-layer/db";

const dayMs = 86_400_000;
const defaultRangeDays = 30;
const maximumRangeDays = 366;

function toWorkspaceSummary(current: CurrentWorkspace): WorkspaceSummary {
  return {
    id: current.workspace.id,
    name: current.workspace.name,
    role: current.membership.role,
  };
}

function requireWorkspace(current: CurrentWorkspace | null): CurrentWorkspace {
  if (current === null) {
    throw new HttpError(
      404,
      "WORKSPACE_NOT_FOUND",
      "The user does not belong to a workspace.",
    );
  }

  return current;
}

export function createWorkspaceService(repository: {
  createForUser: (
    input: CreateWorkspaceInput,
  ) => Promise<CreateWorkspaceResult>;
  findForUser: (userId: string) => Promise<CurrentWorkspace | null>;
  getAnalytics: (
    input: WorkspaceAnalyticsInput,
  ) => Promise<WorkspaceUsageAnalytics>;
  listMemberUsage: (
    input: WorkspaceAnalyticsRankingInput,
  ) => Promise<
    AnalyticsRankingPage<WorkspaceUsageAnalytics["memberUsage"][number]>
  >;
  listToolUsage: (
    input: WorkspaceAnalyticsRankingInput,
  ) => Promise<
    AnalyticsRankingPage<WorkspaceUsageAnalytics["toolUsage"][number]>
  >;
  getOverviewForUser: (userId: string) => Promise<WorkspaceOverview | null>;
}) {
  function parseDateOnly(value: string): Date | null {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? parsed
      : null;
  }

  function dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  function dateInTimeZone(value: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(value);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (year === undefined || month === undefined || day === undefined) {
      throw new HttpError(
        400,
        "INVALID_ANALYTICS_TIME_ZONE",
        "The analytics time zone is invalid.",
      );
    }

    return `${year}-${month}-${day}`;
  }

  function analyticsRanges(
    start: string | undefined,
    end: string | undefined,
    timeZone: string,
  ) {
    const today = dateInTimeZone(new Date(), timeZone);
    const selectedEnd = parseDateOnly(end ?? today);

    if (selectedEnd === null) {
      throw new HttpError(
        400,
        "INVALID_ANALYTICS_RANGE",
        "The analytics dates are invalid.",
      );
    }

    const selectedStart =
      start === undefined
        ? new Date(selectedEnd.getTime() - (defaultRangeDays - 1) * dayMs)
        : parseDateOnly(start);

    if (selectedStart === null) {
      throw new HttpError(
        400,
        "INVALID_ANALYTICS_RANGE",
        "The analytics dates are invalid.",
      );
    }

    if (selectedStart > selectedEnd) {
      throw new HttpError(
        400,
        "INVALID_ANALYTICS_RANGE",
        "The start date must be on or before the end date.",
      );
    }

    if (dateOnly(selectedEnd) > today) {
      throw new HttpError(
        400,
        "INVALID_ANALYTICS_RANGE",
        "The end date cannot be in the future.",
      );
    }

    const durationDays =
      Math.floor((selectedEnd.getTime() - selectedStart.getTime()) / dayMs) + 1;

    if (durationDays > maximumRangeDays) {
      throw new HttpError(
        400,
        "INVALID_ANALYTICS_RANGE",
        "The analytics range cannot exceed 366 days.",
      );
    }

    const endExclusive = new Date(selectedEnd.getTime() + dayMs);
    const comparisonEndExclusive = selectedStart;
    const comparisonStart = new Date(
      selectedStart.getTime() - durationDays * dayMs,
    );

    return {
      comparison: {
        endExclusive: dateOnly(comparisonEndExclusive),
        start: dateOnly(comparisonStart),
      },
      range: {
        endExclusive: dateOnly(endExclusive),
        start: dateOnly(selectedStart),
      },
    };
  }

  function summaryContract(
    summary: WorkspaceUsageAnalytics["summary"],
  ): UsageSummaryContract {
    return {
      ...summary,
      successRate:
        summary.toolCallCount === 0
          ? null
          : summary.succeededCount / summary.toolCallCount,
    };
  }

  function collapseProviders(
    usage: WorkspaceUsageAnalytics["providerUsage"],
  ): ProviderUsageContract[] {
    const visible = usage.slice(0, 4).map((item) => ({
      ...item,
      isOther: false,
    }));
    const remainder = usage.slice(4);

    if (remainder.length === 0) return visible;
    return [
      ...visible,
      {
        failedCount: remainder.reduce(
          (total, item) => total + item.failedCount,
          0,
        ),
        isOther: true,
        provider: null,
        succeededCount: remainder.reduce(
          (total, item) => total + item.succeededCount,
          0,
        ),
        toolCallCount: remainder.reduce(
          (total, item) => total + item.toolCallCount,
          0,
        ),
      },
    ];
  }

  function toolContract(
    item: WorkspaceUsageAnalytics["toolUsage"][number],
  ): ToolUsageContract {
    return {
      ...item,
      successRate:
        item.toolCallCount === 0 ? 0 : item.succeededCount / item.toolCallCount,
    };
  }

  function memberContract(
    item: WorkspaceUsageAnalytics["memberUsage"][number],
  ): MemberUsageContract {
    return {
      ...item,
      lastUsedAt: item.lastUsedAt.toISOString(),
      successRate:
        item.toolCallCount === 0 ? 0 : item.succeededCount / item.toolCallCount,
    };
  }

  function previewTools(
    usage: WorkspaceUsageAnalytics["toolUsage"],
  ): ToolUsageContract[] {
    return usage.slice(0, 5).map(toolContract);
  }

  function previewMembers(
    usage: WorkspaceUsageAnalytics["memberUsage"],
  ): MemberUsageContract[] {
    return usage.slice(0, 5).map(memberContract);
  }

  function analyticsInput(
    current: CurrentWorkspace,
    start: string | undefined,
    end: string | undefined,
    provider: string | undefined,
    selectedMembershipId: string | undefined,
    timeZone: string,
  ): WorkspaceAnalyticsInput {
    const ranges = analyticsRanges(start, end, timeZone);

    if (
      selectedMembershipId !== undefined &&
      current.membership.role !== "owner"
    ) {
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Workspace owner access is required to filter by member.",
      );
    }

    return {
      comparison: ranges.comparison,
      membershipId: current.membership.id,
      ...(provider === undefined
        ? {}
        : { provider: parseProviderKey(provider) }),
      range: ranges.range,
      ...(selectedMembershipId === undefined ? {} : { selectedMembershipId }),
      timeZone,
      workspaceId: current.workspace.id,
    };
  }

  return {
    async createWorkspace(
      userId: string,
      name: string,
      correlationId: string,
    ): Promise<WorkspaceSummary> {
      let created: CreateWorkspaceResult;

      try {
        created = await repository.createForUser({
          correlationId,
          name,
          userId,
        });
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "conflict") {
          throw new HttpError(
            409,
            "WORKSPACE_MEMBERSHIP_EXISTS",
            "The user already belongs to a workspace.",
          );
        }

        throw error;
      }

      return toWorkspaceSummary(created);
    },

    async getCurrentWorkspace(userId: string): Promise<WorkspaceSummary> {
      return toWorkspaceSummary(
        requireWorkspace(await repository.findForUser(userId)),
      );
    },

    async getWorkspaceAnalytics(
      userId: string,
      start: string | undefined,
      end: string | undefined,
      provider: string | undefined,
      selectedMembershipId: string | undefined,
      timeZone: string,
    ): Promise<WorkspaceAnalyticsResponse> {
      const current = requireWorkspace(await repository.findForUser(userId));
      const input = analyticsInput(
        current,
        start,
        end,
        provider,
        selectedMembershipId,
        timeZone,
      );
      const analytics = await repository.getAnalytics(input);
      const rangeContract = {
        end: dateOnly(
          new Date(
            new Date(`${input.range.endExclusive}T00:00:00.000Z`).getTime() -
              dayMs,
          ),
        ),
        start: input.range.start,
      };
      const comparisonRangeContract = {
        end: dateOnly(
          new Date(
            new Date(
              `${input.comparison.endExclusive}T00:00:00.000Z`,
            ).getTime() - dayMs,
          ),
        ),
        start: input.comparison.start,
      };

      return {
        comparison: {
          range: comparisonRangeContract,
          summary: summaryContract(analytics.comparison),
        },
        dailyUsage: analytics.dailyUsage,
        ...(analytics.role === "owner"
          ? {
              memberUsage: previewMembers(analytics.memberUsage),
              memberUsageTotal: analytics.memberUsageTotal,
            }
          : {}),
        providerUsage: collapseProviders(analytics.providerUsage),
        range: rangeContract,
        recentActivity: analytics.recentActivity.map((activity) => ({
          id: activity.id,
          ...(analytics.role === "owner"
            ? {
                member: {
                  email: activity.email,
                  membershipId: activity.membershipId,
                  name: activity.memberName,
                },
              }
            : {}),
          occurredAt: activity.occurredAt.toISOString(),
          provider: activity.provider,
          status: activity.status,
          toolName: activity.toolName,
        })),
        role: analytics.role,
        summary: summaryContract(analytics.summary),
        toolUsage: previewTools(analytics.toolUsage),
        toolUsageTotal: analytics.toolUsageTotal,
        timeZone,
      };
    },

    async getWorkspaceAnalyticsRanking(
      userId: string,
      query: {
        dimension: "member" | "tool";
        direction: AnalyticsSortDirection;
        end?: string | undefined;
        limit: number;
        membershipId?: string | undefined;
        offset: number;
        provider?: string | undefined;
        query: string;
        sort: AnalyticsRankingSort;
        start?: string | undefined;
        timeZone: string;
      },
    ): Promise<AnalyticsRankingResponse> {
      const current = requireWorkspace(await repository.findForUser(userId));
      const base = analyticsInput(
        current,
        query.start,
        query.end,
        query.provider,
        query.membershipId,
        query.timeZone,
      );
      const input: WorkspaceAnalyticsRankingInput = {
        direction: query.direction,
        limit: query.limit,
        membershipId: base.membershipId,
        offset: query.offset,
        ...(base.provider === undefined ? {} : { provider: base.provider }),
        query: query.query,
        range: base.range,
        ...(base.selectedMembershipId === undefined
          ? {}
          : { selectedMembershipId: base.selectedMembershipId }),
        sort: query.sort,
        timeZone: query.timeZone,
        workspaceId: base.workspaceId,
      };

      if (query.dimension === "member") {
        if (current.membership.role !== "owner") {
          throw new HttpError(
            403,
            "FORBIDDEN",
            "Workspace owner access is required for member analytics.",
          );
        }
        const page = await repository.listMemberUsage(input);
        return {
          dimension: "member",
          items: page.items.map(memberContract),
          limit: query.limit,
          offset: query.offset,
          timeZone: query.timeZone,
          total: page.total,
        };
      }

      const page = await repository.listToolUsage(input);
      return {
        dimension: "tool",
        items: page.items.map(toolContract),
        limit: query.limit,
        offset: query.offset,
        timeZone: query.timeZone,
        total: page.total,
      };
    },

    async getWorkspaceOverview(
      userId: string,
    ): Promise<WorkspaceOverviewResponse> {
      const overview = await repository.getOverviewForUser(userId);

      if (overview === null) {
        throw new HttpError(
          404,
          "WORKSPACE_NOT_FOUND",
          "The user does not belong to a workspace.",
        );
      }

      return {
        ...toWorkspaceSummary(overview),
        activeMcpTokenCount: overview.activeMcpTokenCount,
        connectedIntegrationCount: overview.connectedIntegrationCount,
        memberCount: overview.memberCount,
        recentActivity: overview.recentActivity.map((event) => ({
          category: event.category,
          id: event.id,
          occurredAt: event.occurredAt.toISOString(),
          operation: event.operation,
          status: event.status,
          summary: event.summary,
        })),
      };
    },
  };
}
