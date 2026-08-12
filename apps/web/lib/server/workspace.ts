import "server-only";

import { cache } from "react";
import type { ZodType } from "zod";

import { requestApi } from "@/lib/server/api-client";
import {
  workspaceOverviewSchema,
  workspaceAnalyticsSchema,
  type WorkspaceAnalytics,
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

export type WorkspaceAnalyticsState =
  | { status: "anonymous" }
  | { analytics: WorkspaceAnalytics; status: "available" }
  | { message: string; status: "invalid" }
  | { status: "unavailable" }
  | { status: "without-workspace" };

export const getWorkspaceAnalyticsState = cache(
  async (
    start?: string,
    end?: string,
    provider?: string,
    membershipId?: string,
    timeZone = "UTC",
  ): Promise<WorkspaceAnalyticsState> => {
    const search = new URLSearchParams();
    if (start !== undefined) search.set("start", start);
    if (end !== undefined) search.set("end", end);
    if (provider !== undefined) search.set("provider", provider);
    if (membershipId !== undefined) search.set("membershipId", membershipId);
    search.set("timeZone", timeZone);
    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const result = await requestApi(
      `/api/workspaces/current/analytics${suffix}`,
    );

    if (result.status === 401) return { status: "anonymous" };
    if (result.status === 404) return { status: "without-workspace" };
    if (result.status === 400) {
      const errorValue =
        typeof result.data === "object" &&
        result.data !== null &&
        "error" in result.data
          ? (result.data as Record<string, unknown>).error
          : null;
      const messageValue =
        typeof errorValue === "object" && errorValue !== null
          ? (errorValue as Record<string, unknown>).message
          : null;
      const message =
        typeof messageValue === "string"
          ? messageValue
          : "The selected date range is invalid.";
      return { message, status: "invalid" };
    }
    if (!result.ok) return { status: "unavailable" };

    const analytics = parseData(result.data, workspaceAnalyticsSchema);
    return analytics === null
      ? { status: "unavailable" }
      : { analytics, status: "available" };
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
