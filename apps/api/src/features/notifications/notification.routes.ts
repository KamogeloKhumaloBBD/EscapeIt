import { Router, type RequestHandler } from "express";
import type { ZodError } from "zod";

import { HttpError } from "../../errors";
import type { AuthenticatedLocals } from "../../http/authentication";
import {
  channelParameterSchema,
  channelSourcesSchema,
  createChannelSchema,
  preferenceOverrideSchema,
  updateChannelSchema,
} from "./notification.schemas";
import type { createNotificationService } from "./notification.service";

export interface NotificationRouterDependencies {
  requireAuthentication: RequestHandler;
  service: ReturnType<typeof createNotificationService>;
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

export function createNotificationRouter({
  requireAuthentication,
  service,
}: NotificationRouterDependencies): Router {
  const router = Router();
  router.use(requireAuthentication);

  router.get("/channels", async (request, response) => {
    const channels = await service.list(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
    );
    response.status(200).json({ data: channels });
  });

  router.post("/channels", async (request, response) => {
    const parsed = createChannelSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const channel = await service.createChannel(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      parsed.data.provider,
      parsed.data.name,
      parsed.data.webhookUrl,
      correlationId(request.id),
    );
    response.status(201).json({ data: channel });
  });

  router.put("/channels/:channelId", async (request, response) => {
    const params = channelParameterSchema.safeParse(request.params);
    const body = updateChannelSchema.safeParse(request.body);

    if (!params.success) {
      throw validationError(params.error);
    }

    if (!body.success) {
      throw validationError(body.error);
    }

    const channel = await service.updateChannel(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      params.data.channelId,
      body.data.name,
      body.data.webhookUrl,
      correlationId(request.id),
    );
    response.status(200).json({ data: channel });
  });

  router.delete("/channels/:channelId", async (request, response) => {
    const params = channelParameterSchema.safeParse(request.params);

    if (!params.success) {
      throw validationError(params.error);
    }

    await service.deleteChannel(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      params.data.channelId,
      correlationId(request.id),
    );
    response.status(204).send();
  });

  router.put("/channels/:channelId/sources", async (request, response) => {
    const params = channelParameterSchema.safeParse(request.params);
    const body = channelSourcesSchema.safeParse(request.body);

    if (!params.success) {
      throw validationError(params.error);
    }

    if (!body.success) {
      throw validationError(body.error);
    }

    const channel = await service.setChannelSources(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      params.data.channelId,
      body.data.providers,
    );
    response.status(200).json({ data: channel });
  });

  router.post("/channels/:channelId/test", async (request, response) => {
    const params = channelParameterSchema.safeParse(request.params);

    if (!params.success) {
      throw validationError(params.error);
    }

    await service.testChannel(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      params.data.channelId,
    );
    response.status(200).json({ data: { sent: true } });
  });

  router.get("/preferences", async (request, response) => {
    const preferences = await service.listPreferences(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
    );
    response.status(200).json({ data: preferences });
  });

  router.put("/preferences", async (request, response) => {
    const parsed = preferenceOverrideSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const preference = await service.setPreference(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      parsed.data.eventKey,
      parsed.data.enabled,
    );
    response.status(200).json({ data: preference });
  });

  return router;
}
