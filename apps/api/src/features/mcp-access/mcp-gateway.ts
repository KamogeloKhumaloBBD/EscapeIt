import { createHash } from "node:crypto";

import type {
  ProviderKey,
  ResolvedMcpPrincipal,
  ResolvedOAuthAccess,
} from "@context-layer/db";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  McpServer,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import type { Request, RequestHandler } from "express";
import type { Logger } from "pino";

import type { McpPrincipal, McpToolProvider } from "./mcp-tool-provider";

const tokenPattern = /^ctx_mcp_[A-Za-z0-9_-]{43}$/;
const oauthAccessTokenPattern = /^ctx_oauth_at_[A-Za-z0-9_-]{32,256}$/;

export interface McpGatewayToolProvider {
  provider: ProviderKey;
  toolProvider: McpToolProvider;
}

export interface McpGatewayDependencies {
  logger: Logger;
  publicAppUrl: string;
  resolveBundleProviderKeys: (
    workspaceId: string,
    bundleId: string,
  ) => Promise<ReadonlySet<ProviderKey>>;
  resolveOAuthToken: (token: string) => Promise<ResolvedOAuthAccess | null>;
  resolveToken: (tokenHash: Uint8Array) => Promise<ResolvedMcpPrincipal | null>;
  toolProviders?: readonly McpGatewayToolProvider[];
}

type AuthenticatedMcpRequest = Request & { auth?: AuthInfo };

function writeError(
  response: Parameters<RequestHandler>[1],
  status: number,
  code: number,
  message: string,
): void {
  response.status(status).json({
    error: { code, message },
    id: null,
    jsonrpc: "2.0",
  });
}

function readBearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1];
  return token !== undefined && token.length <= 512 ? token : null;
}

function isMcpPrincipal(value: unknown): value is McpPrincipal {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const bundleId: unknown = Reflect.get(value, "bundleId");

  if (typeof bundleId !== "string" && bundleId !== null) {
    return false;
  }

  return [
    "correlationId",
    "membershipId",
    "role",
    "userEmail",
    "userId",
    "userName",
    "workspaceId",
    "workspaceName",
  ].every((key) => typeof Reflect.get(value, key) === "string");
}

export function createMcpGateway({
  logger,
  publicAppUrl,
  resolveBundleProviderKeys,
  resolveOAuthToken,
  resolveToken,
  toolProviders = [],
}: McpGatewayDependencies): RequestHandler {
  const allowedOrigin = new URL(publicAppUrl).origin;
  const resourceMetadata = `${publicAppUrl.replace(/\/$/, "")}/.well-known/oauth-protected-resource/api/mcp`;
  const challenge = `Bearer resource_metadata="${resourceMetadata}", scope="mcp:access"`;
  const handler = createMcpHandler(
    async ({ authInfo }) => {
      const principal = authInfo?.extra?.principal;

      if (!isMcpPrincipal(principal)) {
        throw new Error("The MCP principal is unavailable.");
      }

      const server = new McpServer(
        { name: "context-layer", version: "0.1.0" },
        {
          capabilities: { tools: {} },
          instructions:
            "Context Layer connects coding agents to allowlisted workspace context using the authenticated member's provider accounts.",
        },
      );

      const allowedProviders =
        principal.bundleId === null
          ? null
          : await resolveBundleProviderKeys(
              principal.workspaceId,
              principal.bundleId,
            );

      for (const { provider, toolProvider } of toolProviders) {
        if (allowedProviders !== null && !allowedProviders.has(provider)) {
          continue;
        }

        await toolProvider.registerTools(server, principal);
      }

      return server;
    },
    {
      legacy: "stateless",
      onerror(error) {
        logger.error({ errorName: error.name }, "MCP protocol request failed");
      },
      responseMode: "json",
    },
  );
  const nodeHandler = toNodeHandler(handler, {
    onerror(error) {
      logger.error({ errorName: error.name }, "MCP transport request failed");
    },
  });

  return async (request, response) => {
    const origin = request.headers.origin;

    if (
      origin !== undefined &&
      (typeof origin !== "string" || origin !== allowedOrigin)
    ) {
      writeError(response, 403, -32_000, "Origin not allowed.");
      return;
    }

    const rawToken = readBearerToken(request.headers.authorization);

    if (rawToken === null) {
      response.setHeader("WWW-Authenticate", challenge);
      writeError(response, 401, -32_001, "Authentication required.");
      return;
    }

    let principal: McpPrincipal | null = null;
    let credentialClientId: string | null = null;
    let scopes: string[] = [];

    try {
      if (tokenPattern.test(rawToken)) {
        const resolved = await resolveToken(
          createHash("sha256").update(rawToken, "utf8").digest(),
        );

        if (resolved !== null) {
          const { bundleId, tokenId, ...identity } = resolved;
          credentialClientId = tokenId;
          principal = {
            ...identity,
            bundleId,
            correlationId:
              typeof request.id === "string" ? request.id : tokenId,
          };
        }
      } else if (oauthAccessTokenPattern.test(rawToken)) {
        const resolved = await resolveOAuthToken(
          rawToken.slice("ctx_oauth_at_".length),
        );

        if (resolved?.scopes.includes("mcp:access") === true) {
          credentialClientId = resolved.clientId;
          scopes = resolved.scopes;
          principal = {
            ...resolved.identity,
            bundleId: resolved.bundleId,
            correlationId:
              typeof request.id === "string" ? request.id : resolved.clientId,
          };
        }
      }
    } catch {
      request.log.error("Unable to resolve MCP credential");
      writeError(
        response,
        503,
        -32_002,
        "MCP access is temporarily unavailable.",
      );
      return;
    }

    if (principal === null || credentialClientId === null) {
      response.setHeader("WWW-Authenticate", challenge);
      writeError(response, 401, -32_001, "Authentication required.");
      return;
    }

    const authenticatedRequest = request as AuthenticatedMcpRequest;
    authenticatedRequest.headers.authorization = undefined;
    authenticatedRequest.auth = {
      clientId: credentialClientId,
      extra: { principal },
      scopes,
      token: "[redacted]",
    };
    response.setHeader("Cache-Control", "no-store");

    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      writeError(response, 405, -32_003, "Method not allowed.");
      return;
    }

    await nodeHandler(authenticatedRequest, response);
  };
}
