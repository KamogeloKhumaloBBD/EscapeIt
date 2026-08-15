import type { ResolvedMcpIdentity } from "@context-layer/db";
import type { McpServer } from "@modelcontextprotocol/server";

export interface McpPrincipal extends ResolvedMcpIdentity {
  bundleId: string | null;
  correlationId: string;
}

export interface McpToolProvider {
  registerTools(server: McpServer, principal: McpPrincipal): Promise<void>;
}
