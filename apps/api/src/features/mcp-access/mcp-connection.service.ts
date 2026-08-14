import type { CurrentWorkspace, McpOAuthConnection } from "@context-layer/db";

import { HttpError } from "../../errors";
import { requireWorkspace } from "../shared/require-workspace";

export interface McpConnectionRepository {
  findClient: (
    clientId: string,
  ) => Promise<{ clientId: string; clientName: string } | null>;
  findCurrentWorkspace: (userId: string) => Promise<CurrentWorkspace | null>;
  hasLiveConsent: (
    userId: string,
    clientId: string,
    referenceId: string,
  ) => Promise<boolean>;
  listConnections: (userId: string) => Promise<McpOAuthConnection[]>;
  revokeConnection: (userId: string, consentId: string) => Promise<boolean>;
  setConnectionBundle: (
    clientId: string,
    userId: string,
    referenceId: string,
    bundleId: string | null,
  ) => Promise<void>;
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

    async setBundle(
      userId: string,
      clientId: string,
      bundleId: string | null,
    ): Promise<void> {
      const workspace = requireWorkspace(
        await repository.findCurrentWorkspace(userId),
      );
      const client = await repository.findClient(clientId);

      if (client === null) {
        throw new HttpError(
          404,
          "MCP_CONNECTION_NOT_FOUND",
          "The MCP client was not found.",
        );
      }

      const hasConsent = await repository.hasLiveConsent(
        userId,
        clientId,
        workspace.workspace.id,
      );

      if (!hasConsent) {
        throw new HttpError(
          404,
          "MCP_CONNECTION_NOT_FOUND",
          "The connected MCP client was not found.",
        );
      }

      await repository.setConnectionBundle(
        clientId,
        userId,
        workspace.workspace.id,
        bundleId,
      );
    },
  };
}
