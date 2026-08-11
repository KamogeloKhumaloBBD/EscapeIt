import "server-only";

import type { ZodType } from "zod";

import { requestApi } from "@/lib/server/api-client";
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

type ApiState<T> =
  | { status: "anonymous" }
  | { data: T; status: "available" }
  | { status: "not-found" }
  | { status: "unavailable" };

function parseData<T>(data: unknown, schema: ZodType<T>): T | null {
  if (typeof data !== "object" || data === null || !("data" in data)) {
    return null;
  }

  const parsed = schema.safeParse(Reflect.get(data, "data"));
  return parsed.success && parsed.data !== undefined ? parsed.data : null;
}

async function requestState<T>(
  path: `/api/${string}`,
  schema: ZodType<T>,
): Promise<ApiState<T>> {
  const result = await requestApi(path);

  if (result.status === 401) {
    return { status: "anonymous" };
  }

  if (result.status === 404) {
    return { status: "not-found" };
  }

  if (!result.ok) {
    return { status: "unavailable" };
  }

  const data = parseData(result.data, schema);
  return data === null
    ? { status: "unavailable" }
    : { data, status: "available" };
}

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
