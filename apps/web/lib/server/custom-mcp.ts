import "server-only";

import type { ApiState } from "@/lib/server/api-state";
import { requestState } from "@/lib/server/api-state";
import {
  customMcpServerListSchema,
  customMcpServerSchema,
  type CustomMcpServer,
} from "@/lib/validation/custom-mcp";

export function getCustomMcpServersState(): Promise<
  ApiState<CustomMcpServer[]>
> {
  return requestState(
    "/api/custom-mcp-servers",
    customMcpServerListSchema,
    "We couldn't load Custom MCP servers. Refresh the page to try again.",
  );
}

export function getCustomMcpServerState(
  serverId: string,
): Promise<ApiState<CustomMcpServer>> {
  return requestState(
    `/api/custom-mcp-servers/${encodeURIComponent(serverId)}`,
    customMcpServerSchema,
    "We couldn't load this Custom MCP server. Refresh the page to try again.",
  );
}
