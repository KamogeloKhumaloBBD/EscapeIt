import type { McpOAuthConnection } from "@context-layer/db";

import { HttpError } from "../../errors";

export interface McpConnectionRepository {
  findClient: (
    clientId: string,
  ) => Promise<{ clientId: string; clientName: string } | null>;
  listConnections: (userId: string) => Promise<McpOAuthConnection[]>;
  revokeConnection: (userId: string, consentId: string) => Promise<boolean>;
}

export function createMcpConnectionService(
  repository: McpConnectionRepository,
) {
  return {
    async getConnections(userId: string, requestedClientId?: string) {
      const [connections, requestedClient] = await Promise.all([
        repository.listConnections(userId),
        requestedClientId === undefined
          ? Promise.resolve(null)
          : repository.findClient(requestedClientId),
      ]);

      return { connections, requestedClient };
    },

    async revokeConnection(userId: string, consentId: string): Promise<void> {
      if (!(await repository.revokeConnection(userId, consentId))) {
        throw new HttpError(
          404,
          "MCP_CONNECTION_NOT_FOUND",
          "The connected MCP client was not found.",
        );
      }
    },
  };
}
