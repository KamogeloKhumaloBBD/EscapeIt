import { Router, type RequestHandler } from "express";
import type { ZodError } from "zod";

import { HttpError } from "../../errors";
import type { AuthenticatedLocals } from "../../http/authentication";
import { createWorkspaceSchema } from "./workspace.schemas";
import type { createWorkspaceService } from "./workspace.service";

export interface WorkspaceRouterDependencies {
  requireAuthentication: RequestHandler;
  service: ReturnType<typeof createWorkspaceService>;
}

function validationError(error: ZodError): HttpError {
  return new HttpError(
    400,
    "INVALID_REQUEST",
    error.issues[0]?.message ?? "The request is invalid.",
  );
}

export function createWorkspaceRouter({
  requireAuthentication,
  service,
}: WorkspaceRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication);

  router.get("/current", async (_request, response) => {
    const workspace = await service.getCurrentWorkspace(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
    );
    response.status(200).json({ data: workspace });
  });

  router.post("/", async (request, response) => {
    const parsed = createWorkspaceSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    if (typeof request.id !== "string") {
      throw new HttpError(
        500,
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred.",
      );
    }

    const workspace = await service.createWorkspace(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      parsed.data.name,
      request.id,
    );
    response.status(201).json({ data: workspace });
  });

  router.get("/current/overview", async (_request, response) => {
    const overview = await service.getWorkspaceOverview(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
    );
    response.status(200).json({ data: overview });
  });

  return router;
}
