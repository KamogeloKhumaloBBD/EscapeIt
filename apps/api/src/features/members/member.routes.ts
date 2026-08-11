import { Router, type RequestHandler } from "express";
import type { ZodError } from "zod";

import { HttpError } from "../../errors";
import type { AuthenticatedLocals } from "../../http/authentication";
import {
  createInvitationSchema,
  invitationIdSchema,
  invitationTokenBodySchema,
} from "./member.schemas";
import type { createMemberService } from "./member.service";

export interface MemberRouterDependencies {
  requireAuthentication: RequestHandler;
  service: ReturnType<typeof createMemberService>;
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

export function createMemberRouter({
  requireAuthentication,
  service,
}: MemberRouterDependencies): Router {
  const router = Router();
  router.use(requireAuthentication);

  router.get("/members", async (_request, response) => {
    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    response.status(200).json({ data: await service.listMembers(user.id) });
  });

  router.post("/invitations", async (request, response) => {
    const parsed = createInvitationSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    await service.createInvitation(
      user.id,
      parsed.data.email,
      correlationId(request.id),
    );
    response.status(201).json({ data: { created: true } });
  });

  router.delete("/invitations/:invitationId", async (request, response) => {
    const parsed = invitationIdSchema.safeParse(request.params.invitationId);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    await service.revokeInvitation(
      user.id,
      parsed.data,
      correlationId(request.id),
    );
    response.status(204).send();
  });

  router.post("/invitations/preview", async (request, response) => {
    const parsed = invitationTokenBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    response.status(200).json({
      data: await service.getInvitation(user.id, user.email, parsed.data.token),
    });
  });

  router.post("/invitations/accept", async (request, response) => {
    const parsed = invitationTokenBodySchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const user = (response.locals as AuthenticatedLocals).authenticatedUser;
    await service.acceptInvitation(
      user.id,
      user.email,
      parsed.data.token,
      correlationId(request.id),
    );
    response.status(200).json({ data: { accepted: true } });
  });

  return router;
}
