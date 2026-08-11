import { z } from "zod";

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a workspace name.")
  .max(120, "Workspace names must be 120 characters or fewer.");

export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["owner", "member"]),
});

export const workspaceOverviewSchema = workspaceSummarySchema.extend({
  activeMcpTokenCount: z.number().int().nonnegative(),
  connectedIntegrationCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  recentActivity: z.array(
    z.object({
      category: z.string(),
      id: z.string(),
      occurredAt: z.iso.datetime(),
      operation: z.string(),
      status: z.string(),
      summary: z.string(),
    }),
  ),
});

export type WorkspaceOverview = z.infer<typeof workspaceOverviewSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
