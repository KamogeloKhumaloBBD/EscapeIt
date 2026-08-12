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

const usageSummarySchema = z.object({
  activeIntegrationCount: z.number().int().nonnegative(),
  activeMemberCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  succeededCount: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1).nullable(),
  toolCallCount: z.number().int().nonnegative(),
});

const analyticsRangeSchema = z.object({
  end: z.iso.date(),
  start: z.iso.date(),
});

const providerUsageSchema = z.object({
  failedCount: z.number().int().nonnegative(),
  isOther: z.boolean(),
  provider: z.string().nullable(),
  succeededCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
});

export const toolUsageSchema = z.object({
  failedCount: z.number().int().nonnegative(),
  provider: z.string(),
  succeededCount: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  toolCallCount: z.number().int().nonnegative(),
  toolName: z.string(),
});

export const memberUsageSchema = z.object({
  email: z.string(),
  failedCount: z.number().int().nonnegative(),
  lastUsedAt: z.iso.datetime(),
  membershipId: z.string(),
  name: z.string(),
  succeededCount: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  toolCallCount: z.number().int().nonnegative(),
});

export const workspaceAnalyticsSchema = z.object({
  comparison: z.object({
    range: analyticsRangeSchema,
    summary: usageSummarySchema,
  }),
  dailyUsage: z.array(
    z.object({
      date: z.iso.date(),
      failedCount: z.number().int().nonnegative(),
      succeededCount: z.number().int().nonnegative(),
      toolCallCount: z.number().int().nonnegative(),
    }),
  ),
  memberUsage: z.array(memberUsageSchema).optional(),
  memberUsageTotal: z.number().int().nonnegative().optional(),
  providerUsage: z.array(providerUsageSchema),
  range: analyticsRangeSchema,
  recentActivity: z.array(
    z.object({
      id: z.string(),
      member: z
        .object({
          email: z.string(),
          membershipId: z.string(),
          name: z.string(),
        })
        .optional(),
      occurredAt: z.iso.datetime(),
      provider: z.string(),
      status: z.string(),
      toolName: z.string(),
    }),
  ),
  role: z.enum(["member", "owner"]),
  summary: usageSummarySchema,
  toolUsage: z.array(toolUsageSchema),
  toolUsageTotal: z.number().int().nonnegative(),
});

export const analyticsRankingSchema = z.discriminatedUnion("dimension", [
  z.object({
    dimension: z.literal("tool"),
    items: z.array(toolUsageSchema),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  z.object({
    dimension: z.literal("member"),
    items: z.array(memberUsageSchema),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
]);

export type WorkspaceAnalytics = z.infer<typeof workspaceAnalyticsSchema>;
export type AnalyticsRanking = z.infer<typeof analyticsRankingSchema>;
export type ToolUsage = z.infer<typeof toolUsageSchema>;
export type MemberUsage = z.infer<typeof memberUsageSchema>;
