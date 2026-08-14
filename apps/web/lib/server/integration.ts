import "server-only";

import type { ApiState } from "@/lib/server/api-state";
import { requestState } from "@/lib/server/api-state";
import {
  integrationDetailSchema,
  integrationListSchema,
  integrationResourcesSchema,
  scopeDiscoverySchema,
  type IntegrationDetail,
  type IntegrationResource,
  type IntegrationSummary,
  type ScopeDiscovery,
} from "@/lib/validation/integration";

export function getIntegrationsState(): Promise<
  ApiState<IntegrationSummary[]>
> {
  return requestState("/api/integrations", integrationListSchema);
}

export function getIntegrationState(
  provider: string,
): Promise<ApiState<IntegrationDetail>> {
  return requestState(
    `/api/integrations/${encodeURIComponent(provider)}`,
    integrationDetailSchema,
  );
}

export function getIntegrationResourcesState(
  provider: string,
): Promise<ApiState<IntegrationResource[]>> {
  return requestState(
    `/api/integrations/${encodeURIComponent(provider)}/resources`,
    integrationResourcesSchema,
  );
}

export function getScopeDiscoveryState(
  provider: string,
  query = "",
): Promise<ApiState<ScopeDiscovery>> {
  const parameters = new URLSearchParams({ query });
  return requestState(
    `/api/integrations/${encodeURIComponent(provider)}/scopes?${parameters.toString()}`,
    scopeDiscoverySchema,
  );
}
