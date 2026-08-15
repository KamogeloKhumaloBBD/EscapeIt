import { Router, type RequestHandler } from "express";
import type { ZodError } from "zod";

import { HttpError } from "../../errors";
import type { AuthenticatedLocals } from "../../http/authentication";
import {
  bundleIdParameterSchema,
  createBundleSchema,
  replaceBundleCustomMcpServersSchema,
  replaceBundleProvidersSchema,
  updateBundleSchema,
} from "./bundle.schemas";
import type { createIntegrationBundleService } from "./bundle.service";

export interface IntegrationBundleRouterDependencies {
  requireAuthentication: RequestHandler;
  service: ReturnType<typeof createIntegrationBundleService>;
}

function validationError(error: ZodError): HttpError {
  return new HttpError(
    400,
    "INVALID_REQUEST",
    error.issues[0]?.message ?? "The request is invalid.",
  );
}

function requireBundleId(value: unknown): string {
  const parsed = bundleIdParameterSchema.safeParse(value);

  if (!parsed.success) {
    throw validationError(parsed.error);
  }

  return parsed.data;
}

export function createIntegrationBundleRouter({
  requireAuthentication,
  service,
}: IntegrationBundleRouterDependencies): Router {
  const router = Router();
  router.use(requireAuthentication);

  router.get("/", async (request, response) => {
    const bundles = await service.list(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
    );
    response.status(200).json({ data: bundles });
  });

  router.post("/", async (request, response) => {
    const parsed = createBundleSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const bundle = await service.create(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      {
        description: parsed.data.description ?? null,
        name: parsed.data.name,
      },
    );
    response.status(201).json({ data: bundle });
  });

  router.get("/:bundleId", async (request, response) => {
    const bundleId = requireBundleId(request.params.bundleId);
    const bundle = await service.getDetail(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      bundleId,
    );
    response.status(200).json({ data: bundle });
  });

  router.put("/:bundleId", async (request, response) => {
    const bundleId = requireBundleId(request.params.bundleId);
    const parsed = updateBundleSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const bundle = await service.update(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      bundleId,
      parsed.data,
    );
    response.status(200).json({ data: bundle });
  });

  router.put("/:bundleId/providers", async (request, response) => {
    const bundleId = requireBundleId(request.params.bundleId);
    const parsed = replaceBundleProvidersSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const bundle = await service.replaceProviders(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      bundleId,
      parsed.data.providers,
    );
    response.status(200).json({ data: bundle });
  });

  router.put("/:bundleId/custom-mcp-servers", async (request, response) => {
    const bundleId = requireBundleId(request.params.bundleId);
    const parsed = replaceBundleCustomMcpServersSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const bundle = await service.replaceCustomMcpServers(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      bundleId,
      parsed.data.serverIds,
    );
    response.status(200).json({ data: bundle });
  });

  router.delete("/:bundleId", async (request, response) => {
    const bundleId = requireBundleId(request.params.bundleId);
    await service.delete(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      bundleId,
    );
    response.status(204).send();
  });

  return router;
}
