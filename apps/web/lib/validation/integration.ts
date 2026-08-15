import { z } from "zod";

const connectionStatusSchema = z.enum(["connected", "disconnected", "error"]);
const resourceSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  url: z.url(),
});
export const integrationScopeSchema = z.object({
  displayName: z.string(),
  externalId: z.string(),
  scopeKey: z.string(),
});
export const integrationMcpToolSchema = z.object({
  description: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
  kind: z.enum(["read", "write"]),
  name: z.string(),
});
export const integrationNotificationEventSchema = z.object({
  displayName: z.string(),
  enabled: z.boolean(),
  key: z.string(),
});
const integrationSummarySchema = z.object({
  attention: z.string().nullable(),
  capabilities: z.array(z.string()),
  currentAccount: z
    .object({
      displayName: z.string().nullable().optional(),
      lastValidatedAt: z.iso.datetime().nullable(),
      status: connectionStatusSchema,
    })
    .nullable(),
  description: z.string(),
  displayName: z.string(),
  installation: z
    .object({
      enabledMcpToolCount: z.number().int().nonnegative(),
      lastValidatedAt: z.iso.datetime().nullable(),
      resource: resourceSchema.nullable(),
      selectedScopeCount: z.number().int().nonnegative(),
      status: connectionStatusSchema,
    })
    .nullable(),
  nextStep: z.enum([
    "connect_account",
    "connect_provider",
    "ready",
    "select_tools",
    "select_scopes",
    "select_resource",
    "wait_for_owner",
  ]),
  permissions: z.object({
    canConnectAccount: z.boolean(),
    canManageInstallation: z.boolean(),
    canManageMcpTools: z.boolean(),
    canManageNotifications: z.boolean(),
    canManageScopes: z.boolean(),
  }),
  presentation: z.object({
    accountLabel: z.string().optional(),
    resourceLabel: z.string().optional(),
    scopeLabels: z
      .object({ plural: z.string(), singular: z.string() })
      .optional(),
  }),
  provider: z.string(),
  resourceSelection: z.enum(["application", "authorization"]).optional(),
});

export const integrationListSchema = z.array(integrationSummarySchema);
export const integrationDetailSchema = integrationSummarySchema.extend({
  mcpTools: z.array(integrationMcpToolSchema),
  notificationEvents: z.array(integrationNotificationEventSchema),
  notificationSetupUrl: z.url().nullable().default(null),
  selectedScopes: z.array(integrationScopeSchema),
});
export const integrationResourcesSchema = z.array(resourceSchema);
export const scopeDiscoverySchema = z.object({
  items: z.array(integrationScopeSchema),
  nextCursor: z.string().nullable(),
});

export type IntegrationDetail = z.infer<typeof integrationDetailSchema>;
export type IntegrationMcpTool = z.infer<typeof integrationMcpToolSchema>;
export type IntegrationNotificationEvent = z.infer<
  typeof integrationNotificationEventSchema
>;
export type IntegrationResource = z.infer<typeof resourceSchema>;
export type IntegrationScope = z.infer<typeof integrationScopeSchema>;
export type IntegrationSummary = z.infer<typeof integrationSummarySchema>;
export type ScopeDiscovery = z.infer<typeof scopeDiscoverySchema>;
