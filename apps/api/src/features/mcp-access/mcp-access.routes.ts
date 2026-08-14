import { Router, type RequestHandler } from "express";
import type { ZodError } from "zod";

import { HttpError } from "../../errors";
import type { AuthenticatedLocals } from "../../http/authentication";
import { createMcpTokenSchema, mcpTokenIdSchema } from "./mcp-access.schemas";
import type { createMcpAccessService } from "./mcp-access.service";

export interface McpAccessRouterDependencies {
  requireAuthentication: RequestHandler;
  service: ReturnType<typeof createMcpAccessService>;
}

function validationError(error: ZodError): HttpError {
  return new HttpError(
    400,
    "INVALID_REQUEST",
    error.issues[0]?.message ?? "The request is invalid.",
  );
}

function correlationId(requestId: unknown): string {
  if (typeof requestId !== "string") {
    throw new HttpError(
      500,
      "INTERNAL_SERVER_ERROR",
      "An unexpected error occurred.",
    );
  }

  return requestId;
}

export function createMcpAccessRouter({
  requireAuthentication,
  service,
}: McpAccessRouterDependencies): Router {
  const router = Router();
  router.use(requireAuthentication);

  router.get("/", async (_request, response) => {
    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    response.status(200).json({ data: await service.listTokens(user.id) });
  });

  router.post("/", async (request, response) => {
    const parsed = createMcpTokenSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    response.status(201).json({
      data: await service.createToken(
        user,
        parsed.data.name,
        parsed.data.bundleId ?? null,
        correlationId(request.id),
      ),
    });
  });

  router.delete("/:tokenId", async (request, response) => {
    const parsed = mcpTokenIdSchema.safeParse(request.params.tokenId);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    await service.revokeToken(user.id, parsed.data, correlationId(request.id));
    response.status(204).send();
  });

  return router;
}
