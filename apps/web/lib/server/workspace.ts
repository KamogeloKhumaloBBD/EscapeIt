import "server-only";

import { cache } from "react";
import type { ZodType } from "zod";

import { requestApi } from "@/lib/server/api-client";
import {
  workspaceOverviewSchema,
  workspaceSummarySchema,
  type WorkspaceOverview,
  type WorkspaceSummary,
} from "@/lib/validation/workspace";

export type CurrentWorkspaceState =
  | { status: "anonymous" }
  | { status: "available"; workspace: WorkspaceSummary }
  | { status: "unavailable" }
  | { status: "without-workspace" };

function parseData<T>(data: unknown, schema: ZodType<T>): T | null {
  if (typeof data !== "object" || data === null || !("data" in data)) {
    return null;
  }

  const parsed = schema.safeParse(Reflect.get(data, "data"));
  return parsed.success && parsed.data !== undefined ? parsed.data : null;
}

export const getCurrentWorkspaceState = cache(
  async (): Promise<CurrentWorkspaceState> => {
    const result = await requestApi("/api/workspaces/current");

    if (result.status === 401) {
      return { status: "anonymous" };
    }

    if (result.status === 404) {
      return { status: "without-workspace" };
    }

    if (!result.ok) {
      return { status: "unavailable" };
    }

    const workspace = parseData(result.data, workspaceSummarySchema);
    return workspace === null
      ? { status: "unavailable" }
      : { status: "available", workspace };
  },
);

export type WorkspaceOverviewState =
  | { status: "anonymous" }
  | { status: "available"; overview: WorkspaceOverview }
  | { status: "unavailable" }
  | { status: "without-workspace" };

export const getWorkspaceOverviewState = cache(
  async (): Promise<WorkspaceOverviewState> => {
    const result = await requestApi("/api/workspaces/current/overview");

    if (result.status === 401) {
      return { status: "anonymous" };
    }

    if (result.status === 404) {
      return { status: "without-workspace" };
    }

    if (!result.ok) {
      return { status: "unavailable" };
    }

    const overview = parseData(result.data, workspaceOverviewSchema);
    return overview === null
      ? { status: "unavailable" }
      : { status: "available", overview };
  },
);
