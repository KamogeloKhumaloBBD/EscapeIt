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
  return requestState(
    "/api/integrations",
    integrationListSchema,
    "We couldn't load the provider catalogue. Refresh the page to try again.",
  );
}

export function getIntegrationState(
  provider: string,
): Promise<ApiState<IntegrationDetail>> {
  return requestState(
    `/api/integrations/${encodeURIComponent(provider)}`,
    integrationDetailSchema,
    "We couldn't load this integration. Refresh the page to try again.",
  );
}

export function getIntegrationResourcesState(
  provider: string,
): Promise<ApiState<IntegrationResource[]>> {
  return requestState(
    `/api/integrations/${encodeURIComponent(provider)}/resources`,
    integrationResourcesSchema,
    "We couldn't load available provider resources. Check the connected account and try again.",
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
    "We couldn't load available provider access. Check the connected account and try again.",
  );
}
