import "server-only";

import { cache } from "react";

import { requestApi } from "@/lib/server/api-client";
import { extractDataField } from "@/lib/server/api-state";
import {
  mcpTokenListSchema,
  type McpTokenList,
} from "@/lib/validation/mcp-access";

export type McpAccessState =
  | { data: McpTokenList; status: "available" }
  | { status: "anonymous" }
  | { status: "unavailable" }
  | { status: "without-workspace" };

export const getMcpAccessState = cache(async (): Promise<McpAccessState> => {
  const result = await requestApi("/api/mcp-tokens");

  if (result.status === 401) return { status: "anonymous" };
  if (result.status === 404) return { status: "without-workspace" };
  if (!result.ok) return { status: "unavailable" };

  const parsed = mcpTokenListSchema.safeParse(extractDataField(result.data));
  return parsed.success
    ? { data: parsed.data, status: "available" }
    : { status: "unavailable" };
});

export function getPublicMcpEndpoint(): string {
  const publicAppUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
  return new URL("/api/mcp", publicAppUrl).toString();
}
