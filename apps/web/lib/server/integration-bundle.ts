import "server-only";

import type { ApiState } from "@/lib/server/api-state";
import { requestState } from "@/lib/server/api-state";
import {
  bundleListSchema,
  bundleSchema,
  type Bundle,
} from "@/lib/validation/integration-bundle";

export function getBundleListState(): Promise<ApiState<Bundle[]>> {
  return requestState("/api/integration-bundles", bundleListSchema);
}

export function getBundleState(bundleId: string): Promise<ApiState<Bundle>> {
  return requestState(
    `/api/integration-bundles/${encodeURIComponent(bundleId)}`,
    bundleSchema,
  );
}
