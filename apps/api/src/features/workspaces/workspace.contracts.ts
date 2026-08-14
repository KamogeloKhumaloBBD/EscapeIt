export interface WorkspaceSummary {
  id: string;
  name: string;
  role: "member" | "owner";
}

export interface WorkspaceActivitySummary {
  category: string;
  id: string;
  occurredAt: string;
  operation: string;
  status: string;
  summary: string;
}

export interface WorkspaceOverviewResponse extends WorkspaceSummary {
  activeMcpTokenCount: number;
  connectedIntegrationCount: number;
  memberCount: number;
  recentActivity: WorkspaceActivitySummary[];
}

export interface AnalyticsRangeContract {
  end: string;
  start: string;
}

export interface UsageSummaryContract {
  activeIntegrationCount: number;
  activeMemberCount: number;
  failedCount: number;
  succeededCount: number;
  successRate: number | null;
  toolCallCount: number;
}

export interface DailyUsageContract {
  date: string;
  failedCount: number;
  succeededCount: number;
  toolCallCount: number;
}

export interface ProviderUsageContract {
  failedCount: number;
  isOther: boolean;
  provider: string | null;
  succeededCount: number;
  toolCallCount: number;
}

export interface ToolUsageContract {
  failedCount: number;
  provider: string;
  succeededCount: number;
  successRate: number;
  toolCallCount: number;
  toolName: string;
}

export interface MemberUsageContract {
  email: string;
  failedCount: number;
  lastUsedAt: string;
  membershipId: string;
  name: string;
  succeededCount: number;
  successRate: number;
  toolCallCount: number;
}

export interface RecentToolActivityContract {
  id: string;
  member?: {
    email: string;
    membershipId: string;
    name: string;
  };
  occurredAt: string;
  provider: string;
  status: string;
  toolName: string;
}

export interface WorkspaceAnalyticsResponse {
  comparison: {
    range: AnalyticsRangeContract;
    summary: UsageSummaryContract;
  };
  dailyUsage: DailyUsageContract[];
  memberUsage?: MemberUsageContract[];
  memberUsageTotal?: number;
  providerUsage: ProviderUsageContract[];
  range: AnalyticsRangeContract;
  recentActivity: RecentToolActivityContract[];
  role: "member" | "owner";
  summary: UsageSummaryContract;
  toolUsage: ToolUsageContract[];
  toolUsageTotal: number;
  timeZone: string;
}

export interface AnalyticsRankingResponse {
  dimension: "member" | "tool";
  items: MemberUsageContract[] | ToolUsageContract[];
  limit: number;
  offset: number;
  timeZone: string;
  total: number;
}
