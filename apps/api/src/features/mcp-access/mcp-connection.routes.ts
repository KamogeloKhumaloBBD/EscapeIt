import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { HttpError } from "../../errors";
import type { AuthenticatedLocals } from "../../http/authentication";
import type { createMcpConnectionService } from "./mcp-connection.service";

const identifierSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, "The identifier is invalid.");

const setBundleSchema = z.object({
  bundleId: z.uuid("The bundle identifier is invalid.").nullable(),
});

export interface McpConnectionRouterDependencies {
  requireAuthentication: RequestHandler;
  service: ReturnType<typeof createMcpConnectionService>;
}

export function createMcpConnectionRouter({
  requireAuthentication,
  service,
}: McpConnectionRouterDependencies): Router {
  const router = Router();
  router.use(requireAuthentication);

  router.get("/", async (request, response) => {
    const parsedClientId = z
      .object({ clientId: identifierSchema.optional() })
      .safeParse(request.query);

    if (!parsedClientId.success) {
      throw new HttpError(
        400,
        "INVALID_REQUEST",
        parsedClientId.error.issues[0]?.message ?? "The request is invalid.",
      );
    }

    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      data: await service.getConnections(user.id, parsedClientId.data.clientId),
    });
  });

  router.put("/:clientId/bundle", async (request, response) => {
    const parsedClientId = identifierSchema.safeParse(request.params.clientId);

    if (!parsedClientId.success) {
      throw new HttpError(
        400,
        "INVALID_REQUEST",
        parsedClientId.error.issues[0]?.message ?? "The request is invalid.",
      );
    }

    const parsedBody = setBundleSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new HttpError(
        400,
        "INVALID_REQUEST",
        parsedBody.error.issues[0]?.message ?? "The request is invalid.",
      );
    }

    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    await service.setBundle(
      user.id,
      parsedClientId.data,
      parsedBody.data.bundleId,
    );
    response.status(204).send();
  });

  router.delete("/:consentId", async (request, response) => {
    const parsedConsentId = identifierSchema.safeParse(
      request.params.consentId,
    );

    if (!parsedConsentId.success) {
      throw new HttpError(
        400,
        "INVALID_REQUEST",
        parsedConsentId.error.issues[0]?.message ?? "The request is invalid.",
      );
    }

    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    await service.revokeConnection(user.id, parsedConsentId.data);
    response.status(204).send();
  });

  return router;
}
