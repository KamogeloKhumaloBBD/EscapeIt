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
