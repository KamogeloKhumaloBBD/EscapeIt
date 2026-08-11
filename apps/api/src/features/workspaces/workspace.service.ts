import type {
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  CurrentWorkspace,
  WorkspaceOverview,
} from "@context-layer/db";
import { RepositoryError } from "@context-layer/db";

import { HttpError } from "../../errors";
import type {
  WorkspaceOverviewResponse,
  WorkspaceSummary,
} from "./workspace.contracts";

function toWorkspaceSummary(current: CurrentWorkspace): WorkspaceSummary {
  return {
    id: current.workspace.id,
    name: current.workspace.name,
    role: current.membership.role,
  };
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

export function createWorkspaceService(repository: {
  createForUser: (
    input: CreateWorkspaceInput,
  ) => Promise<CreateWorkspaceResult>;
  findForUser: (userId: string) => Promise<CurrentWorkspace | null>;
  getOverviewForUser: (userId: string) => Promise<WorkspaceOverview | null>;
}) {
  return {
    async createWorkspace(
      userId: string,
      name: string,
      correlationId: string,
    ): Promise<WorkspaceSummary> {
      let created: CreateWorkspaceResult;

      try {
        created = await repository.createForUser({
          correlationId,
          name,
          userId,
        });
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "conflict") {
          throw new HttpError(
            409,
            "WORKSPACE_MEMBERSHIP_EXISTS",
            "The user already belongs to a workspace.",
          );
        }

        throw error;
      }

      return toWorkspaceSummary(created);
    },

    async getCurrentWorkspace(userId: string): Promise<WorkspaceSummary> {
      return toWorkspaceSummary(
        requireWorkspace(await repository.findForUser(userId)),
      );
    },

    async getWorkspaceOverview(
      userId: string,
    ): Promise<WorkspaceOverviewResponse> {
      const overview = await repository.getOverviewForUser(userId);

      if (overview === null) {
        throw new HttpError(
          404,
          "WORKSPACE_NOT_FOUND",
          "The user does not belong to a workspace.",
        );
      }

      return {
        ...toWorkspaceSummary(overview),
        activeMcpTokenCount: overview.activeMcpTokenCount,
        connectedIntegrationCount: overview.connectedIntegrationCount,
        memberCount: overview.memberCount,
        recentActivity: overview.recentActivity.map((event) => ({
          category: event.category,
          id: event.id,
          occurredAt: event.occurredAt.toISOString(),
          operation: event.operation,
          status: event.status,
          summary: event.summary,
        })),
      };
    },
  };
}
