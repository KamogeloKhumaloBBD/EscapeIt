import { Router, type RequestHandler } from "express";
import type { ZodError } from "zod";

import { HttpError } from "../../errors";
import type { AuthenticatedLocals } from "../../http/authentication";
import {
  oauthStatesMatch,
  verifyOAuthState,
} from "../../integrations/oauth-state";
import {
  installationSelectionSchema,
  mcpToolSelectionSchema,
  notificationsToggleSchema,
  oauthCallbackSchema,
  providerParameterSchema,
  scopeDiscoveryQuerySchema,
  scopeSelectionSchema,
} from "./integration.schemas";
import type { createIntegrationService } from "./integration.service";

export interface IntegrationRouterDependencies {
  nodeEnvironment: "development" | "production";
  oauthStateSecret: string;
  publicAppUrl: string;
  requireAuthentication: RequestHandler;
  service: ReturnType<typeof createIntegrationService>;
}

function validationError(error: ZodError): HttpError {
  return new HttpError(
    400,
    "INVALID_REQUEST",
    error.issues[0]?.message ?? "The request is invalid.",
  );
}

function requireProvider(value: unknown): string {
  const parsed = providerParameterSchema.safeParse(value);

  if (!parsed.success) {
    throw validationError(parsed.error);
  }

  return parsed.data;
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

function oauthCookieName(provider: string): string {
  return `context_layer_oauth_${provider}_state`;
}

function readCookie(header: string | undefined, name: string): string | null {
  if (header === undefined) {
    return null;
  }

  for (const value of header.split(";")) {
    const [cookieName, ...parts] = value.trim().split("=");

    if (cookieName === name) {
      try {
        return decodeURIComponent(parts.join("="));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function detailUrl(publicAppUrl: string, provider: string, result: string) {
  const url = new URL(`/integrations/${provider}`, publicAppUrl);
  url.searchParams.set("oauth", result);
  return url.toString();
}

export function createIntegrationRouter({
  nodeEnvironment,
  oauthStateSecret,
  publicAppUrl,
  requireAuthentication,
  service,
}: IntegrationRouterDependencies): Router {
  const router = Router();
  router.use(requireAuthentication);

  router.get("/", async (request, response) => {
    const integrations = await service.list(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
    );
    response.status(200).json({ data: integrations });
  });

  router.get("/:provider/oauth/start", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    const result = await service.beginOAuth(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
    );

    response.cookie(oauthCookieName(provider), result.state, {
      httpOnly: true,
      maxAge: 10 * 60 * 1_000,
      path: `/api/integrations/${provider}/oauth/callback`,
      sameSite: "lax",
      secure: nodeEnvironment === "production",
    });
    response.redirect(302, result.authorizationUrl);
  });

  router.get("/:provider/oauth/callback", async (request, response) => {
    const providerResult = providerParameterSchema.safeParse(
      request.params.provider,
    );

    if (!providerResult.success) {
      response.redirect(302, new URL("/integrations", publicAppUrl).toString());
      return;
    }

    const provider = providerResult.data;
    const cookieName = oauthCookieName(provider);
    const cookieState = readCookie(request.headers.cookie, cookieName);
    response.clearCookie(cookieName, {
      httpOnly: true,
      path: `/api/integrations/${provider}/oauth/callback`,
      sameSite: "lax",
      secure: nodeEnvironment === "production",
    });

    if (typeof request.query.error === "string") {
      response.redirect(302, detailUrl(publicAppUrl, provider, "cancelled"));
      return;
    }

    const parsed = oauthCallbackSchema.safeParse(request.query);

    if (
      !parsed.success ||
      cookieState === null ||
      !oauthStatesMatch(cookieState, parsed.data.state)
    ) {
      response.redirect(302, detailUrl(publicAppUrl, provider, "invalid"));
      return;
    }

    const verified = verifyOAuthState(cookieState, oauthStateSecret);

    if (verified?.provider !== provider) {
      response.redirect(302, detailUrl(publicAppUrl, provider, "invalid"));
      return;
    }

    try {
      await service.completeOAuth(
        (response.locals as AuthenticatedLocals).authenticatedUser.id,
        provider,
        parsed.data.code,
        verified.membershipId,
        correlationId(request.id),
      );
      response.redirect(302, detailUrl(publicAppUrl, provider, "connected"));
    } catch (error) {
      request.log.warn(
        {
          code:
            error instanceof HttpError ? error.code : "OAUTH_CALLBACK_FAILED",
        },
        "Provider OAuth callback failed",
      );
      response.redirect(302, detailUrl(publicAppUrl, provider, "failed"));
    }
  });

  router.get("/:provider/resources", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    const resources = await service.discoverResources(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
    );
    response.status(200).json({ data: resources });
  });

  router.put("/:provider/installation", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    const parsed = installationSelectionSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const resource = await service.selectInstallation(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
      parsed.data.externalId,
      correlationId(request.id),
    );
    response.status(200).json({ data: resource });
  });

  router.get("/:provider/scopes", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    const parsed = scopeDiscoveryQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const scopes = await service.discoverScopes(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
      parsed.data.query,
      parsed.data.cursor ?? null,
    );
    response.status(200).json({ data: scopes });
  });

  router.put("/:provider/scopes", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    const parsed = scopeSelectionSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const scopes = await service.replaceScopes(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
      parsed.data.externalIds,
      correlationId(request.id),
    );
    response.status(200).json({ data: scopes });
  });

  router.put("/:provider/mcp-tools", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    const parsed = mcpToolSelectionSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const tools = await service.replaceMcpTools(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
      parsed.data.toolNames,
      correlationId(request.id),
    );
    response.status(200).json({ data: tools });
  });

  router.put("/:provider/notifications", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    const parsed = notificationsToggleSchema.safeParse(request.body);

    if (!parsed.success) {
      throw validationError(parsed.error);
    }

    const integration = await service.setNotificationsEnabled(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
      parsed.data.enabled,
      correlationId(request.id),
    );
    response.status(200).json({ data: integration });
  });

  router.post("/:provider/validate", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    await service.validate(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
      correlationId(request.id),
    );
    response.status(200).json({ data: { valid: true } });
  });

  router.delete("/:provider/account", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    await service.disconnectAccount(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
      correlationId(request.id),
    );
    response.status(204).send();
  });

  router.delete("/:provider", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    await service.disconnectInstallation(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
      correlationId(request.id),
    );
    response.status(204).send();
  });

  router.get("/:provider", async (request, response) => {
    const provider = requireProvider(request.params.provider);
    const integration = await service.getDetail(
      (response.locals as AuthenticatedLocals).authenticatedUser.id,
      provider,
    );
    response.status(200).json({ data: integration });
  });

  return router;
}
