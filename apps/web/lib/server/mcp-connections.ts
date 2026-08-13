import "server-only";

import { requestApi } from "@/lib/server/api-client";
import { mcpConnectionsPayloadSchema } from "@/lib/validation/mcp-connection";

export async function getMcpConnections(clientId?: string) {
  const suffix =
    clientId === undefined ? "" : `?clientId=${encodeURIComponent(clientId)}`;
  const result = await requestApi(`/api/mcp-connections${suffix}`);

  if (!result.ok || typeof result.data !== "object" || result.data === null) {
    return null;
  }

  const parsed = mcpConnectionsPayloadSchema.safeParse(
    Reflect.get(result.data, "data"),
  );
  return parsed.success ? parsed.data : null;
}
