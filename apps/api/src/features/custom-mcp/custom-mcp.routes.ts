import { Router, type RequestHandler } from "express";
import type { ZodError } from "zod";

import { HttpError } from "../../errors";
import type { AuthenticatedLocals } from "../../http/authentication";
import {
  customMcpOAuthStatesMatch,
  verifyCustomMcpOAuthState,
} from "./custom-mcp-oauth-state";
import {
  bearerAccountSchema,
  createCustomMcpServerSchema,
  customMcpOAuthCallbackSchema,
  customMcpServerIdSchema,
  renameCustomMcpServerSchema,
  replaceCustomMcpToolsSchema,
} from "./custom-mcp.schemas";
import type { createCustomMcpService } from "./custom-mcp.service";

const oauthCookieName = "ctx_custom_mcp_oauth_state";

function validationError(error: ZodError): HttpError {
  return new HttpError(
    400,
    "INVALID_REQUEST",
    error.issues[0]?.message ?? "The request is invalid.",
  );
}

function serverId(value: unknown): string {
  const parsed = customMcpServerIdSchema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function userId(response: Parameters<RequestHandler>[1]): string {
  return (response.locals as AuthenticatedLocals).authenticatedUser.id;
}

function readCookie(header: string | undefined, name: string): string | null {
  if (header === undefined) return null;
  for (const item of header.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export function createCustomMcpServerRouter(input: {
  nodeEnvironment: "development" | "production";
  requireAuthentication: RequestHandler;
  service: ReturnType<typeof createCustomMcpService>;
}): Router {
  const router = Router();
  router.use(input.requireAuthentication);

  router.get("/", async (_request, response) => {
    response
      .status(200)
      .json({ data: await input.service.list(userId(response)) });
  });

  router.post("/", async (request, response) => {
    const parsed = createCustomMcpServerSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    const value = await input.service.create(
      userId(response),
      parsed.data.name,
      parsed.data.endpointUrl,
    );
    response.status(201).json({ data: value });
  });

  router.get("/:serverId", async (request, response) => {
    response.status(200).json({
      data: await input.service.getDetail(
        userId(response),
        serverId(request.params.serverId),
      ),
    });
  });

  router.patch("/:serverId", async (request, response) => {
    const parsed = renameCustomMcpServerSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    response.status(200).json({
      data: await input.service.rename(
        userId(response),
        serverId(request.params.serverId),
        parsed.data.name,
      ),
    });
  });

  router.get("/:serverId/oauth/start", async (request, response) => {
    const started = await input.service.beginOAuth(
      userId(response),
      serverId(request.params.serverId),
    );
    response.cookie(oauthCookieName, started.state, {
      httpOnly: true,
      maxAge: 10 * 60 * 1_000,
      path: "/api/custom-mcp/oauth/callback",
      sameSite: "lax",
      secure: input.nodeEnvironment === "production",
    });
    response.redirect(302, started.authorizationUrl);
  });

  router.put("/:serverId/account/bearer", async (request, response) => {
    const parsed = bearerAccountSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    response.status(200).json({
      data: await input.service.connectBearer(
        userId(response),
        serverId(request.params.serverId),
        parsed.data.token,
      ),
    });
  });

  router.delete("/:serverId/account", async (request, response) => {
    await input.service.disconnectAccount(
      userId(response),
      serverId(request.params.serverId),
    );
    response.status(204).send();
  });

  router.post("/:serverId/validate", async (request, response) => {
    response.status(200).json({
      data: await input.service.validate(
        userId(response),
        serverId(request.params.serverId),
      ),
    });
  });

  router.post("/:serverId/tools/refresh", async (request, response) => {
    response.status(200).json({
      data: await input.service.refreshTools(
        userId(response),
        serverId(request.params.serverId),
      ),
    });
  });

  router.put("/:serverId/tools", async (request, response) => {
    const parsed = replaceCustomMcpToolsSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    response.status(200).json({
      data: await input.service.replaceTools(
        userId(response),
        serverId(request.params.serverId),
        parsed.data.toolIds,
      ),
    });
  });

  router.delete("/:serverId", async (request, response) => {
    await input.service.archive(
      userId(response),
      serverId(request.params.serverId),
    );
    response.status(204).send();
  });

  return router;
}

export function createCustomMcpOAuthRouter(input: {
  nodeEnvironment: "development" | "production";
  oauthStateSecret: string;
  requireAuthentication: RequestHandler;
  service: ReturnType<typeof createCustomMcpService>;
}): Router {
  const router = Router();
  router.use(input.requireAuthentication);

  router.get("/oauth/callback", async (request, response) => {
    const parsed = customMcpOAuthCallbackSchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error);
    const cookieState = readCookie(request.headers.cookie, oauthCookieName);
    if (
      cookieState === null ||
      !customMcpOAuthStatesMatch(cookieState, parsed.data.state)
    ) {
      throw new HttpError(
        400,
        "CUSTOM_MCP_OAUTH_STATE_INVALID",
        "The OAuth request is invalid. Start the connection again.",
      );
    }
    const state = verifyCustomMcpOAuthState(
      parsed.data.state,
      input.oauthStateSecret,
    );
    if (state === null) {
      throw new HttpError(
        400,
        "CUSTOM_MCP_OAUTH_STATE_INVALID",
        "The OAuth request expired or is invalid. Start the connection again.",
      );
    }
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(request.query)) {
      if (typeof value === "string") parameters.set(key, value);
    }
    try {
      await input.service.completeOAuth(userId(response), state, parameters);
    } catch {
      response.clearCookie(oauthCookieName, {
        httpOnly: true,
        path: "/api/custom-mcp/oauth/callback",
        sameSite: "lax",
        secure: input.nodeEnvironment === "production",
      });
      response.redirect(
        302,
        `/integrations/custom/${encodeURIComponent(state.serverId)}?oauth=failed`,
      );
      return;
    }
    response.clearCookie(oauthCookieName, {
      httpOnly: true,
      path: "/api/custom-mcp/oauth/callback",
      sameSite: "lax",
      secure: input.nodeEnvironment === "production",
    });
    response.redirect(
      302,
      `/integrations/custom/${encodeURIComponent(state.serverId)}?oauth=connected`,
    );
  });

  return router;
}
