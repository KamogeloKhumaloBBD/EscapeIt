import { createHash } from "node:crypto";

import type { ResolvedMcpPrincipal } from "@context-layer/db";
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

export interface McpGatewayDependencies {
  logger: Logger;
  publicAppUrl: string;
  resolveToken: (tokenHash: Uint8Array) => Promise<ResolvedMcpPrincipal | null>;
  toolProviders?: readonly McpToolProvider[];
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
  return token !== undefined && tokenPattern.test(token) ? token : null;
}

function isMcpPrincipal(value: unknown): value is McpPrincipal {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return [
    "correlationId",
    "membershipId",
    "role",
    "tokenId",
    "userId",
    "workspaceId",
  ].every((key) => typeof Reflect.get(value, key) === "string");
}

export function createMcpGateway({
  logger,
  publicAppUrl,
  resolveToken,
  toolProviders = [],
}: McpGatewayDependencies): RequestHandler {
  const allowedOrigin = new URL(publicAppUrl).origin;
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

      for (const provider of toolProviders) {
        await provider.registerTools(server, principal);
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
      response.setHeader("WWW-Authenticate", 'Bearer realm="context-layer"');
      writeError(response, 401, -32_001, "Authentication required.");
      return;
    }

    let resolved: ResolvedMcpPrincipal | null;

    try {
      resolved = await resolveToken(
        createHash("sha256").update(rawToken, "utf8").digest(),
      );
    } catch {
      request.log.error("Unable to resolve MCP access token");
      writeError(
        response,
        503,
        -32_002,
        "MCP access is temporarily unavailable.",
      );
      return;
    }

    if (resolved === null) {
      response.setHeader("WWW-Authenticate", 'Bearer realm="context-layer"');
      writeError(response, 401, -32_001, "Authentication required.");
      return;
    }

    const correlationId =
      typeof request.id === "string" ? request.id : resolved.tokenId;
    const principal: McpPrincipal = { ...resolved, correlationId };
    const authenticatedRequest = request as AuthenticatedMcpRequest;
    authenticatedRequest.headers.authorization = undefined;
    authenticatedRequest.auth = {
      clientId: resolved.tokenId,
      extra: { principal },
      scopes: [],
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
