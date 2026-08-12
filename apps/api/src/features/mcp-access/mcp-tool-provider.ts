import type { ResolvedMcpPrincipal } from "@context-layer/db";
import type { McpServer } from "@modelcontextprotocol/server";

export interface McpPrincipal extends ResolvedMcpPrincipal {
  correlationId: string;
}

export interface McpToolProvider {
  registerTools(server: McpServer, principal: McpPrincipal): Promise<void>;
}
