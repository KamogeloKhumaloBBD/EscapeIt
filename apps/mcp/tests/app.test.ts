import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";

import {
  parseProviderKey,
  type ResolvedMcpPrincipal,
  type ResolvedOAuthAccess,
} from "@context-layer/db";
import type { McpToolProvider } from "@context-layer/integrations";
import {
  createMcpGateway,
  createProtectedResourceMetadataHandler,
} from "@context-layer/mcp-runtime";
import type { Express } from "express";
import pino from "pino";
import { z } from "zod";

import { createMcpApp } from "../src/app";

const publicAppUrl = "https://context.example";
const logger = pino({ level: "silent" });
const openServers: ReturnType<Express["listen"]>[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error === undefined) resolve();
            else reject(error);
          });
        }),
    ),
  );
});

async function serve(app: Express): Promise<string> {
  const server = app.listen(0, "127.0.0.1");
  openServers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(address.port)}`;
}

function appWithGateway({
  resolveOAuthToken = async () => null,
  resolveToken = async () => null,
}: {
  resolveOAuthToken?: (token: string) => Promise<ResolvedOAuthAccess | null>;
  resolveToken?: (
    tokenHash: Uint8Array,
  ) => Promise<ResolvedMcpPrincipal | null>;
} = {}) {
  return createMcpApp({
    allowedOrigin: publicAppUrl,
    checkDatabase: async () => true,
    logger,
    mcpHandler: createMcpGateway({
      logger,
      publicAppUrl,
      resolveBundleProviderKeys: async () => new Set(),
      resolveOAuthToken,
      resolveToken,
    }),
    protectedResourceMetadataHandler: createProtectedResourceMetadataHandler({
      publicAppUrl,
    }),
  });
}

describe("MCP service HTTP boundaries", () => {
  it("reports database readiness without exposing the API health path", async () => {
    const app = createMcpApp({
      allowedOrigin: publicAppUrl,
      checkDatabase: async () => true,
      logger,
      mcpHandler: (_request, response) => response.sendStatus(204),
      protectedResourceMetadataHandler: createProtectedResourceMetadataHandler({
        publicAppUrl,
      }),
    });
    const origin = await serve(app);

    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { database: "up", status: "ok" });

    const apiHealth = await fetch(`${origin}/api/health`);
    assert.equal(apiHealth.status, 404);
  });

  it("returns degraded health when the database is unavailable", async () => {
    const app = createMcpApp({
      allowedOrigin: publicAppUrl,
      checkDatabase: async () => false,
      logger,
      mcpHandler: (_request, response) => response.sendStatus(204),
      protectedResourceMetadataHandler: createProtectedResourceMetadataHandler({
        publicAppUrl,
      }),
    });
    const origin = await serve(app);

    const response = await fetch(`${origin}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      database: "down",
      status: "degraded",
    });
  });

  it("advertises the unchanged canonical resource and authorization server", async () => {
    const origin = await serve(appWithGateway());
    const response = await fetch(
      `${origin}/.well-known/oauth-protected-resource/api/mcp`,
    );

    assert.equal(response.status, 200);
    const metadata = (await response.json()) as {
      authorization_servers: string[];
      resource: string;
      scopes_supported: string[];
    };
    assert.equal(metadata.resource, `${publicAppUrl}/api/mcp`);
    assert.deepEqual(metadata.authorization_servers, [
      `${publicAppUrl}/api/auth`,
    ]);
    assert.deepEqual(metadata.scopes_supported, ["mcp:access"]);
  });

  it("rejects disallowed browser origins before credential resolution", async () => {
    let resolved = false;
    const origin = await serve(
      appWithGateway({
        resolveToken: async () => {
          resolved = true;
          return null;
        },
      }),
    );
    const response = await fetch(`${origin}/api/mcp`, {
      headers: { origin: "https://attacker.example" },
      method: "POST",
    });

    assert.equal(response.status, 403);
    assert.equal(resolved, false);
  });

  it("returns a standards-compatible challenge without a credential", async () => {
    const origin = await serve(appWithGateway());
    const response = await fetch(`${origin}/api/mcp`, { method: "POST" });

    assert.equal(response.status, 401);
    assert.match(
      response.headers.get("www-authenticate") ?? "",
      /resource_metadata="https:\/\/context\.example\/\.well-known\/oauth-protected-resource\/api\/mcp"/,
    );
    assert.match(
      response.headers.get("www-authenticate") ?? "",
      /scope="mcp:access"/,
    );
    const body = (await response.json()) as {
      error: { code: number };
      jsonrpc: string;
    };
    assert.equal(body.error.code, -32_001);
    assert.equal(body.jsonrpc, "2.0");
  });

  it("hashes personal tokens before resolving them and rejects non-POST methods", async () => {
    const rawToken = `ctx_mcp_${"A".repeat(43)}`;
    const resolvedHashes: Uint8Array[] = [];
    const origin = await serve(
      appWithGateway({
        resolveToken: async (tokenHash) => {
          resolvedHashes.push(tokenHash);
          return {
            bundleId: null,
            membershipId: "membership-id",
            role: "member",
            tokenId: "token-id",
            userEmail: "member@example.com",
            userId: "user-id",
            userName: "Member",
            workspaceId: "workspace-id",
            workspaceName: "Workspace",
          };
        },
      }),
    );
    const response = await fetch(`${origin}/api/mcp`, {
      headers: { authorization: `Bearer ${rawToken}` },
      method: "GET",
    });

    assert.equal(response.status, 405);
    assert.equal(resolvedHashes[0]?.byteLength, 32);
    assert.notEqual(Buffer.from(resolvedHashes[0]).toString("utf8"), rawToken);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("requires the MCP OAuth scope and fails closed on repository errors", async () => {
    const oauthToken = `ctx_oauth_at_${"B".repeat(32)}`;
    const noScopeOrigin = await serve(
      appWithGateway({
        resolveOAuthToken: async (token) => ({
          bundleId: null,
          clientId: "client-id",
          identity: {
            membershipId: "membership-id",
            role: "member",
            userEmail: "member@example.com",
            userId: "user-id",
            userName: "Member",
            workspaceId: "workspace-id",
            workspaceName: "Workspace",
          },
          scopes: token === "B".repeat(32) ? [] : ["mcp:access"],
        }),
      }),
    );
    const noScope = await fetch(`${noScopeOrigin}/api/mcp`, {
      headers: { authorization: `Bearer ${oauthToken}` },
      method: "GET",
    });
    assert.equal(noScope.status, 401);

    const failureOrigin = await serve(
      appWithGateway({
        resolveToken: () => Promise.reject(new Error("database unavailable")),
      }),
    );
    const failure = await fetch(`${failureOrigin}/api/mcp`, {
      headers: { authorization: `Bearer ctx_mcp_${"C".repeat(43)}` },
      method: "GET",
    });
    assert.equal(failure.status, 503);
    const body = (await failure.json()) as { error: { code: number } };
    assert.equal(body.error.code, -32_002);
  });

  it("uses the credential principal and bundle to select provider tools", async () => {
    const rawToken = `ctx_mcp_${"D".repeat(43)}`;
    const registrations: { membershipId: string; provider: string }[] = [];
    const provider = (providerName: "github" | "jira") =>
      ({
        async registerTools(server, principal) {
          registrations.push({
            membershipId: principal.membershipId,
            provider: providerName,
          });
          server.registerTool(
            `${providerName}_probe`,
            {
              description: `${providerName} probe`,
              inputSchema: z.object({}),
            },
            () =>
              Promise.resolve({
                content: [{ text: "ok", type: "text" as const }],
              }),
          );
        },
      }) satisfies McpToolProvider;
    const app = createMcpApp({
      allowedOrigin: publicAppUrl,
      checkDatabase: async () => true,
      logger,
      mcpHandler: createMcpGateway({
        logger,
        publicAppUrl,
        resolveBundleProviderKeys: async (workspaceId, bundleId) => {
          assert.equal(workspaceId, "workspace-id");
          assert.equal(bundleId, "bundle-id");
          return new Set([parseProviderKey("github")]);
        },
        resolveOAuthToken: async () => null,
        resolveToken: async () => ({
          bundleId: "bundle-id",
          membershipId: "membership-id",
          role: "member",
          tokenId: "token-id",
          userEmail: "member@example.com",
          userId: "user-id",
          userName: "Member",
          workspaceId: "workspace-id",
          workspaceName: "Workspace",
        }),
        toolProviders: [
          {
            provider: parseProviderKey("github"),
            toolProvider: provider("github"),
          },
          {
            provider: parseProviderKey("jira"),
            toolProvider: provider("jira"),
          },
        ],
      }),
      protectedResourceMetadataHandler: createProtectedResourceMetadataHandler({
        publicAppUrl,
      }),
    });
    const origin = await serve(app);
    const response = await fetch(`${origin}/api/mcp`, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
      }),
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${rawToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });

    assert.equal(response.status, 200);
    const eventStream = await response.text();
    const dataLine = eventStream
      .split(/\r?\n/)
      .find((line) => line.startsWith("data: "));
    assert.ok(dataLine !== undefined);
    const body = JSON.parse(dataLine.slice("data: ".length)) as {
      result: { tools: { name: string }[] };
    };
    assert.deepEqual(
      body.result.tools.map((tool) => tool.name),
      ["github_probe"],
    );
    assert.deepEqual(registrations, [
      { membershipId: "membership-id", provider: "github" },
    ]);
  });
});
