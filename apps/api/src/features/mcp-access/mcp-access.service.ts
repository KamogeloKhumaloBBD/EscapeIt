import { createHash, randomBytes } from "node:crypto";

import type {
  CreateMcpTokenInput,
  CurrentWorkspace,
  McpToken,
  McpTokenSummary,
} from "@context-layer/db";

import { HttpError } from "../../errors";
import type { AuthenticatedUser } from "../../http/authentication";
import type {
  CreatedMcpTokenContract,
  McpTokenContract,
  McpTokenListContract,
} from "./mcp-access.contracts";

const tokenMarker = "ctx_mcp_";

interface McpAccessRepository {
  createToken(input: CreateMcpTokenInput): Promise<McpToken>;
  findCurrentWorkspace(userId: string): Promise<CurrentWorkspace | null>;
  listTokens(
    workspaceId: string,
    requestingMembershipId: string,
  ): Promise<McpTokenSummary[]>;
  revokeToken(
    workspaceId: string,
    tokenId: string,
    requestingMembershipId: string,
    correlationId: string,
  ): Promise<boolean>;
}

export interface McpAccessServiceDependencies {
  repository: McpAccessRepository;
}

function requireWorkspace(current: CurrentWorkspace | null): CurrentWorkspace {
  if (current === null) {
    throw new HttpError(
      404,
      "WORKSPACE_NOT_FOUND",
      "The user does not belong to a workspace.",
    );
  }

  return current;
}

function toContract(
  token: McpTokenSummary,
  currentMembershipId: string,
  role: CurrentWorkspace["membership"]["role"],
): McpTokenContract {
  const isCurrentMember = token.createdByMembershipId === currentMembershipId;

  return {
    createdAt: token.createdAt.toISOString(),
    creator: {
      email: token.creatorEmail,
      membershipId: token.createdByMembershipId,
      name: token.creatorName,
    },
    id: token.id,
    isCurrentMember,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    name: token.name,
    permissions: { canRevoke: isCurrentMember || role === "owner" },
    prefix: token.prefix,
    revokedAt: token.revokedAt?.toISOString() ?? null,
    status: token.revokedAt === null ? "active" : "revoked",
  };
}

export function createMcpAccessService({
  repository,
}: McpAccessServiceDependencies) {
  async function currentWorkspace(userId: string): Promise<CurrentWorkspace> {
    return requireWorkspace(await repository.findCurrentWorkspace(userId));
  }

  return {
    async createToken(
      user: AuthenticatedUser,
      name: string,
      correlationId: string,
    ): Promise<CreatedMcpTokenContract> {
      const current = await currentWorkspace(user.id);
      const secret = randomBytes(32).toString("base64url");
      const rawToken = `${tokenMarker}${secret}`;
      const token = await repository.createToken({
        correlationId,
        createdByMembershipId: current.membership.id,
        name,
        prefix: `${tokenMarker}${secret.slice(0, 8)}`,
        tokenHash: createHash("sha256").update(rawToken, "utf8").digest(),
        workspaceId: current.workspace.id,
      });
      return {
        rawToken,
        token: {
          ...toContract(
            {
              ...token,
              creatorEmail: user.email,
              creatorName: user.name,
            },
            current.membership.id,
            current.membership.role,
          ),
          creator: {
            email: user.email,
            membershipId: current.membership.id,
            name: user.name,
          },
        },
      };
    },

    async listTokens(userId: string): Promise<McpTokenListContract> {
      const current = await currentWorkspace(userId);
      const tokens = await repository.listTokens(
        current.workspace.id,
        current.membership.id,
      );

      return {
        currentMembershipId: current.membership.id,
        role: current.membership.role,
        tokens: tokens.map((token) =>
          toContract(token, current.membership.id, current.membership.role),
        ),
      };
    },

    async revokeToken(
      userId: string,
      tokenId: string,
      correlationId: string,
    ): Promise<void> {
      const current = await currentWorkspace(userId);
      const revoked = await repository.revokeToken(
        current.workspace.id,
        tokenId,
        current.membership.id,
        correlationId,
      );

      if (!revoked) {
        throw new HttpError(
          404,
          "MCP_TOKEN_NOT_FOUND",
          "The token is unavailable or has already been revoked.",
        );
      }
    },
  };
}
