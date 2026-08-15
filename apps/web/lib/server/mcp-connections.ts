import "server-only";

import { requestApi } from "@/lib/server/api-client";
import { apiErrorMessage } from "@/lib/server/api-error";
import { extractDataField, type ApiState } from "@/lib/server/api-state";
import {
  mcpConnectionsPayloadSchema,
  type McpConnectionsPayload,
} from "@/lib/validation/mcp-connection";

export async function getMcpConnections(
  clientId?: string,
): Promise<ApiState<McpConnectionsPayload>> {
  const suffix =
    clientId === undefined ? "" : `?clientId=${encodeURIComponent(clientId)}`;
  const result = await requestApi(`/api/mcp-connections${suffix}`);

  if (result.status === 401) return { status: "anonymous" };
  if (result.status === 404) return { status: "not-found" };
  if (!result.ok)
    return {
      message: apiErrorMessage(
        result,
        "We couldn't load connected MCP clients. Refresh the page to try again.",
      ),
      status: "unavailable",
    };

  const parsed = mcpConnectionsPayloadSchema.safeParse(
    extractDataField(result.data),
  );
  return parsed.success
    ? { data: parsed.data, status: "available" }
    : {
        message:
          "The MCP connection response was invalid. Refresh the page to try again.",
        status: "unavailable",
      };
}
