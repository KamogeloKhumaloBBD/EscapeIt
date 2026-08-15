import "server-only";

import { cache } from "react";

import { requestApi } from "@/lib/server/api-client";
import { extractDataField } from "@/lib/server/api-state";
import { apiErrorMessage } from "@/lib/server/api-error";
import {
  mcpTokenListSchema,
  type McpTokenList,
} from "@/lib/validation/mcp-access";

export type McpAccessState =
  | { data: McpTokenList; status: "available" }
  | { status: "anonymous" }
  | { message: string; status: "unavailable" }
  | { status: "without-workspace" };

export const getMcpAccessState = cache(async (): Promise<McpAccessState> => {
  const result = await requestApi("/api/mcp-tokens");

  if (result.status === 401) return { status: "anonymous" };
  if (result.status === 404) return { status: "without-workspace" };
  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "We couldn't load MCP access. Refresh the page to try again.",
      ),
      status: "unavailable",
    };
  }

  const parsed = mcpTokenListSchema.safeParse(extractDataField(result.data));
  return parsed.success
    ? { data: parsed.data, status: "available" }
    : {
        message:
          "The MCP access response was invalid. Refresh the page to try again.",
        status: "unavailable",
      };
});

export function getPublicMcpEndpoint(): string {
  const publicAppUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
  return new URL("/api/mcp", publicAppUrl).toString();
}
