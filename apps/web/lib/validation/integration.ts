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
const integrationSummarySchema = z.object({
  attention: z.string().nullable(),
  capabilities: z.array(z.string()),
  currentAccount: z
    .object({
      displayName: z.string().nullable(),
      lastValidatedAt: z.iso.datetime().nullable(),
      status: connectionStatusSchema,
    })
    .nullable(),
  description: z.string(),
  displayName: z.string(),
  installation: z
    .object({
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
    "select_scopes",
    "select_site",
    "wait_for_owner",
  ]),
  permissions: z.object({
    canConnectAccount: z.boolean(),
    canManageInstallation: z.boolean(),
    canManageScopes: z.boolean(),
  }),
  provider: z.string(),
});

export const integrationListSchema = z.array(integrationSummarySchema);
export const integrationDetailSchema = integrationSummarySchema.extend({
  selectedScopes: z.array(integrationScopeSchema),
});
export const integrationResourcesSchema = z.array(resourceSchema);
export const scopeDiscoverySchema = z.object({
  items: z.array(integrationScopeSchema),
  nextCursor: z.string().nullable(),
});

export type IntegrationDetail = z.infer<typeof integrationDetailSchema>;
export type IntegrationResource = z.infer<typeof resourceSchema>;
export type IntegrationScope = z.infer<typeof integrationScopeSchema>;
export type IntegrationSummary = z.infer<typeof integrationSummarySchema>;
export type ScopeDiscovery = z.infer<typeof scopeDiscoverySchema>;
