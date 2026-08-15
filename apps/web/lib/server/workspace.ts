import "server-only";

import { cache } from "react";

import { requestApi } from "@/lib/server/api-client";
import { apiErrorMessage, readPublicApiError } from "@/lib/server/api-error";
import { parseData } from "@/lib/server/api-state";
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
  | { message: string; status: "unavailable" }
  | { status: "without-workspace" };

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
      return {
        message: apiErrorMessage(
          result,
          "We couldn't load your workspace. Refresh the page to try again.",
        ),
        status: "unavailable",
      };
    }

    const workspace = parseData(result.data, workspaceSummarySchema);
    return workspace === null
      ? {
          message:
            "The workspace response was invalid. Refresh the page to try again.",
          status: "unavailable",
        }
      : { status: "available", workspace };
  },
);

export type WorkspaceAnalyticsState =
  | { status: "anonymous" }
  | { analytics: WorkspaceAnalytics; status: "available" }
  | { message: string; status: "invalid" }
  | { message: string; status: "unavailable" }
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
      const message =
        readPublicApiError(result.data)?.message ??
        "The selected date range is invalid. Reset the filters and try again.";
      return { message, status: "invalid" };
    }
    if (!result.ok) {
      return {
        message: apiErrorMessage(
          result,
          "We couldn't load workspace analytics. Refresh the page to try again.",
        ),
        status: "unavailable",
      };
    }

    const analytics = parseData(result.data, workspaceAnalyticsSchema);
    return analytics === null
      ? {
          message:
            "The analytics response was invalid. Refresh the page to try again.",
          status: "unavailable",
        }
      : { analytics, status: "available" };
  },
);

export type WorkspaceOverviewState =
  | { status: "anonymous" }
  | { status: "available"; overview: WorkspaceOverview }
  | { message: string; status: "unavailable" }
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
      return {
        message: apiErrorMessage(
          result,
          "We couldn't load the workspace overview. Refresh the page to try again.",
        ),
        status: "unavailable",
      };
    }

    const overview = parseData(result.data, workspaceOverviewSchema);
    return overview === null
      ? {
          message:
            "The workspace overview response was invalid. Refresh the page to try again.",
          status: "unavailable",
        }
      : { status: "available", overview };
  },
);
