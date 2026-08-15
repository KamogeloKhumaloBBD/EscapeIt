import { createHash, timingSafeEqual } from "node:crypto";

import {
  createProductId,
  type AppendActivityEventInput,
  type CurrentWorkspace,
  type CustomMcpAccount,
  type CustomMcpOAuthAttempt,
  type CustomMcpServer,
  type CustomMcpServerDetail,
  type CustomMcpServerSummary,
  type CustomMcpTool,
  type DiscoveredCustomMcpToolInput,
  type EncryptedCredentialEnvelope,
} from "@context-layer/db";
import type { CredentialEncryption } from "@context-layer/security";
import {
  beginRemoteMcpOAuth,
  canonicalizeRemoteMcpUrl,
  discoverRemoteMcpTools,
  discoverWithBearer,
  finishRemoteMcpOAuth,
  probeRemoteMcpServer,
  RemoteMcpError,
  SafeFetchError,
  type PersistedOAuthState,
  type RemoteMcpCredential,
} from "@context-layer/mcp-runtime";

import { HttpError } from "../../errors";
import { requireWorkspace } from "../shared/require-workspace";
import type { CustomMcpServerContract } from "./custom-mcp.contracts";
import { customMcpClientMetadataUrl } from "./custom-mcp-oauth-client";
import { createCustomMcpOAuthState } from "./custom-mcp-oauth-state";

interface Repository {
  appendActivity(input: AppendActivityEventInput): Promise<unknown>;
  archive(
    workspaceId: string,
    serverId: string,
    membershipId: string,
  ): Promise<void>;
  consumeOAuthAttempt(
    workspaceId: string,
    attemptId: string,
    membershipId: string,
  ): Promise<CustomMcpOAuthAttempt | null>;
  create(input: {
    authenticationKind: "bearer" | "none" | "oauth";
    configuredByMembershipId: string;
    endpointUrl: string;
    name: string;
    slug: string;
    status: "connected" | "disconnected";
    tools: readonly DiscoveredCustomMcpToolInput[];
    workspaceId: string;
  }): Promise<CustomMcpServer>;
  createOAuthAttempt(input: {
    accountId: string;
    credentialEnvelope: EncryptedCredentialEnvelope;
    expiresAt: Date;
    id: string;
    membershipId: string;
    serverId: string;
    stateHash: Uint8Array;
    workspaceId: string;
  }): Promise<CustomMcpOAuthAttempt>;
  disconnectAccount(
    workspaceId: string,
    serverId: string,
    membershipId: string,
  ): Promise<void>;
  ensureAccount(input: {
    authMethod: "bearer" | "oauth";
    membershipId: string;
    serverId: string;
    workspaceId: string;
  }): Promise<CustomMcpAccount>;
  findCurrentWorkspace(userId: string): Promise<CurrentWorkspace | null>;
  get(
    workspaceId: string,
    serverId: string,
    membershipId: string,
  ): Promise<CustomMcpServerDetail | null>;
  list(
    workspaceId: string,
    membershipId: string,
  ): Promise<CustomMcpServerSummary[]>;
  rename(
    workspaceId: string,
    serverId: string,
    membershipId: string,
    name: string,
  ): Promise<CustomMcpServer>;
  replaceCatalog(input: {
    ownerMembershipId: string;
    serverId: string;
    tools: readonly DiscoveredCustomMcpToolInput[];
    workspaceId: string;
  }): Promise<CustomMcpTool[]>;
  replaceAccount(input: {
    accountId: string;
    credentialEnvelope: EncryptedCredentialEnvelope;
    expectedEnvelope: EncryptedCredentialEnvelope;
    workspaceId: string;
  }): Promise<CustomMcpAccount | null>;
  replaceTools(input: {
    ownerMembershipId: string;
    serverId: string;
    toolIds: readonly string[];
    workspaceId: string;
  }): Promise<CustomMcpTool[]>;
  saveAccount(input: {
    accountId: string;
    authMethod: "bearer" | "oauth";
    credentialEnvelope: EncryptedCredentialEnvelope;
    membershipId: string;
    serverId: string;
    workspaceId: string;
  }): Promise<CustomMcpAccount>;
}

export interface CustomMcpServiceDependencies {
  credentialEncryption: CredentialEncryption;
  oauthStateSecret: string;
  publicAppUrl: string;
  repository: Repository;
}

function requireOwner(workspace: CurrentWorkspace): void {
  if (workspace.membership.role !== "owner") {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Ask the workspace owner to manage Custom MCP servers.",
    );
  }
}

function mapRemoteError(error: unknown): never {
  if (error instanceof SafeFetchError) {
    throw new HttpError(
      400,
      "CUSTOM_MCP_ENDPOINT_UNSAFE",
      "Choose a public HTTPS MCP endpoint without redirects or private-network addresses.",
    );
  }
  if (error instanceof RemoteMcpError) {
    if (error.code === "authorization_required") {
      throw new HttpError(
        400,
        "CUSTOM_MCP_CREDENTIAL_REJECTED",
        "The Custom MCP server rejected these credentials. Check them and try again.",
      );
    }
    if (error.code === "oauth_unavailable") {
      throw new HttpError(
        400,
        "CUSTOM_MCP_OAUTH_UNAVAILABLE",
        "This server could not complete MCP OAuth. Use a personal bearer token if the server supports one.",
      );
    }
    const invalid = error.code === "catalog_invalid";
    throw new HttpError(
      invalid ? 400 : 502,
      invalid ? "CUSTOM_MCP_CATALOG_INVALID" : "CUSTOM_MCP_UNAVAILABLE",
      invalid
        ? "The server returned an invalid or oversized tool catalogue. Review the server and try again."
        : "The Custom MCP server is unavailable or rejected the connection. Check it and try again.",
    );
  }
  throw new HttpError(
    502,
    "CUSTOM_MCP_UNAVAILABLE",
    "The Custom MCP server could not complete the request. Check it and try again.",
  );
}

function slugBase(name: string): string {
  const value = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return /^[a-z]/.test(value) ? value : `mcp-${value || "server"}`;
}

function toContract(
  detail: CustomMcpServerDetail,
  workspace: CurrentWorkspace,
): CustomMcpServerContract {
  const owner = workspace.membership.role === "owner";
  const connectedAccount = detail.account?.status === "connected";
  const enabledTools = detail.tools.filter(
    (tool) => tool.enabled && tool.available,
  );
  let nextStep: CustomMcpServerContract["nextStep"];
  if (detail.server.status !== "connected") {
    nextStep = owner ? "connect_account" : "wait_for_owner";
  } else if (detail.server.authenticationKind !== "none" && !connectedAccount) {
    nextStep = "connect_account";
  } else if (enabledTools.length === 0) {
    nextStep = owner ? "select_tools" : "wait_for_owner";
  } else {
    nextStep = "ready";
  }
  return {
    authenticationKind: detail.server.authenticationKind,
    currentAccount:
      detail.account === null
        ? null
        : {
            authMethod: detail.account.authMethod,
            lastValidatedAt:
              detail.account.lastValidatedAt?.toISOString() ?? null,
            status: detail.account.status,
          },
    endpointUrl: detail.server.endpointUrl,
    id: detail.server.id,
    lastValidatedAt: detail.server.lastValidatedAt?.toISOString() ?? null,
    name: detail.server.name,
    nextStep,
    permissions: {
      canConnectAccount:
        detail.server.authenticationKind !== "none" &&
        (detail.server.status === "connected" || owner),
      canManageServer: owner,
      canManageTools: owner,
    },
    slug: detail.server.slug,
    status: detail.server.status,
    tools: detail.tools.map((tool) => ({
      available: tool.available,
      description: tool.description,
      enabled: tool.enabled,
      exposedName: tool.exposedName,
      id: tool.id,
      kind: tool.annotations.readOnlyHint === true ? "read" : "write",
      title: tool.title ?? tool.upstreamName,
      upstreamName: tool.upstreamName,
    })),
  };
}

function readCredential(
  encryption: CredentialEncryption,
  account: CustomMcpAccount,
): RemoteMcpCredential {
  if (account.credentialEnvelope === null) {
    throw new HttpError(
      409,
      "CUSTOM_MCP_ACCOUNT_REQUIRED",
      "Connect your Custom MCP account first.",
    );
  }
  return encryption.decrypt(
    account.credentialEnvelope,
    "custom-mcp-account",
    account.id,
  ) as RemoteMcpCredential;
}

export function createCustomMcpService({
  credentialEncryption,
  oauthStateSecret,
  publicAppUrl,
  repository,
}: CustomMcpServiceDependencies) {
  const callbackUrl = `${publicAppUrl.replace(/\/$/, "")}/api/custom-mcp/oauth/callback`;
  const clientMetadataUrl = customMcpClientMetadataUrl(publicAppUrl);

  async function current(userId: string): Promise<CurrentWorkspace> {
    return requireWorkspace(await repository.findCurrentWorkspace(userId));
  }

  async function detail(
    workspace: CurrentWorkspace,
    serverId: string,
  ): Promise<CustomMcpServerDetail> {
    const value = await repository.get(
      workspace.workspace.id,
      serverId,
      workspace.membership.id,
    );
    if (value === null) {
      throw new HttpError(
        404,
        "CUSTOM_MCP_NOT_FOUND",
        "The Custom MCP server was not found. Refresh the page and try again.",
      );
    }
    return value;
  }

  async function saveDiscoveredAccount(
    workspace: CurrentWorkspace,
    server: CustomMcpServerDetail,
    account: CustomMcpAccount,
    credential: RemoteMcpCredential,
    tools: readonly DiscoveredCustomMcpToolInput[],
  ): Promise<CustomMcpServerContract> {
    const envelope = credentialEncryption.encrypt(
      credential,
      "custom-mcp-account",
      account.id,
    );
    await repository.saveAccount({
      accountId: account.id,
      authMethod: credential.authMethod,
      credentialEnvelope: envelope,
      membershipId: workspace.membership.id,
      serverId: server.server.id,
      workspaceId: workspace.workspace.id,
    });
    if (server.server.status !== "connected") {
      requireOwner(workspace);
      await repository.replaceCatalog({
        ownerMembershipId: workspace.membership.id,
        serverId: server.server.id,
        tools,
        workspaceId: workspace.workspace.id,
      });
    }
    return toContract(await detail(workspace, server.server.id), workspace);
  }

  async function persistRotatedCredential(
    workspace: CurrentWorkspace,
    account: CustomMcpAccount | null,
    credential: RemoteMcpCredential | null,
    snapshot: string,
  ): Promise<void> {
    if (
      account?.credentialEnvelope === null ||
      account === null ||
      credential?.authMethod !== "oauth" ||
      JSON.stringify(credential) === snapshot
    ) {
      return;
    }
    await repository.replaceAccount({
      accountId: account.id,
      credentialEnvelope: credentialEncryption.encrypt(
        credential,
        "custom-mcp-account",
        account.id,
      ),
      expectedEnvelope: account.credentialEnvelope,
      workspaceId: workspace.workspace.id,
    });
  }

  return {
    async archive(userId: string, serverId: string): Promise<void> {
      const workspace = await current(userId);
      requireOwner(workspace);
      await repository.archive(
        workspace.workspace.id,
        serverId,
        workspace.membership.id,
      );
      await repository.appendActivity({
        actorMembershipId: workspace.membership.id,
        category: "integration",
        correlationId: serverId,
        metadata: { customMcpServerId: serverId },
        operation: "custom-mcp.server.archive",
        provider: null,
        status: "succeeded",
        subjectMembershipId: workspace.membership.id,
        summary: "Custom MCP server archived",
        workspaceId: workspace.workspace.id,
      });
    },

    async beginOAuth(userId: string, serverId: string) {
      const workspace = await current(userId);
      const server = await detail(workspace, serverId);
      if (server.server.authenticationKind !== "oauth") {
        throw new HttpError(
          409,
          "CUSTOM_MCP_OAUTH_UNAVAILABLE",
          "Use a bearer token for this Custom MCP server.",
        );
      }
      if (server.server.status !== "connected") requireOwner(workspace);
      const account = await repository.ensureAccount({
        authMethod: "oauth",
        membershipId: workspace.membership.id,
        serverId,
        workspaceId: workspace.workspace.id,
      });
      const attemptId = createProductId();
      const stateValue = createCustomMcpOAuthState(oauthStateSecret, {
        attemptId,
        membershipId: workspace.membership.id,
        serverId,
        workspaceId: workspace.workspace.id,
      });
      try {
        const started = await beginRemoteMcpOAuth({
          ...(clientMetadataUrl === undefined ? {} : { clientMetadataUrl }),
          endpointUrl: server.server.endpointUrl,
          redirectUrl: callbackUrl,
          state: stateValue,
        });
        const envelope = credentialEncryption.encrypt(
          started.state,
          "custom-mcp-oauth-attempt",
          attemptId,
        );
        await repository.createOAuthAttempt({
          accountId: account.id,
          credentialEnvelope: envelope,
          expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
          id: attemptId,
          membershipId: workspace.membership.id,
          serverId,
          stateHash: createHash("sha256").update(stateValue).digest(),
          workspaceId: workspace.workspace.id,
        });
        return {
          authorizationUrl: started.authorizationUrl,
          state: stateValue,
        };
      } catch (error) {
        mapRemoteError(error);
      }
    },

    async completeOAuth(
      userId: string,
      state: {
        attemptId: string;
        membershipId: string;
        serverId: string;
        workspaceId: string;
      },
      parameters: URLSearchParams,
    ): Promise<CustomMcpServerContract> {
      const workspace = await current(userId);
      if (
        workspace.workspace.id !== state.workspaceId ||
        workspace.membership.id !== state.membershipId
      ) {
        throw new HttpError(
          400,
          "CUSTOM_MCP_OAUTH_STATE_INVALID",
          "The OAuth request is invalid. Start the connection again.",
        );
      }
      const attempt = await repository.consumeOAuthAttempt(
        state.workspaceId,
        state.attemptId,
        state.membershipId,
      );
      if (attempt === null) {
        throw new HttpError(
          400,
          "CUSTOM_MCP_OAUTH_STATE_INVALID",
          "The OAuth request expired or was already used. Start the connection again.",
        );
      }
      const suppliedState = parameters.get("state") ?? "";
      const suppliedHash = createHash("sha256").update(suppliedState).digest();
      const expectedHash = Buffer.from(attempt.stateHash);
      if (
        expectedHash.byteLength !== suppliedHash.byteLength ||
        !timingSafeEqual(expectedHash, suppliedHash)
      ) {
        throw new HttpError(
          400,
          "CUSTOM_MCP_OAUTH_STATE_INVALID",
          "The OAuth request is invalid. Start the connection again.",
        );
      }
      const server = await detail(workspace, state.serverId);
      const persisted = credentialEncryption.decrypt(
        attempt.credentialEnvelope,
        "custom-mcp-oauth-attempt",
        attempt.id,
      ) as PersistedOAuthState;
      try {
        const finished = await finishRemoteMcpOAuth({
          callbackParameters: parameters,
          ...(clientMetadataUrl === undefined ? {} : { clientMetadataUrl }),
          endpointUrl: server.server.endpointUrl,
          persistedState: persisted,
          redirectUrl: callbackUrl,
          slug: server.server.slug,
        });
        const account = await repository.ensureAccount({
          authMethod: "oauth",
          membershipId: workspace.membership.id,
          serverId: state.serverId,
          workspaceId: workspace.workspace.id,
        });
        return await saveDiscoveredAccount(
          workspace,
          server,
          account,
          finished.credential,
          finished.tools,
        );
      } catch (error) {
        mapRemoteError(error);
      }
    },

    async connectBearer(userId: string, serverId: string, token: string) {
      const workspace = await current(userId);
      const server = await detail(workspace, serverId);
      if (server.server.authenticationKind === "none") {
        throw new HttpError(
          409,
          "CUSTOM_MCP_AUTH_NOT_REQUIRED",
          "This Custom MCP server does not require credentials.",
        );
      }
      if (server.server.status !== "connected") requireOwner(workspace);
      try {
        const tools = await discoverWithBearer(
          server.server.endpointUrl,
          server.server.slug,
          token,
        );
        const account = await repository.ensureAccount({
          authMethod: "bearer",
          membershipId: workspace.membership.id,
          serverId,
          workspaceId: workspace.workspace.id,
        });
        return await saveDiscoveredAccount(
          workspace,
          server,
          account,
          { authMethod: "bearer", token },
          tools,
        );
      } catch (error) {
        mapRemoteError(error);
      }
    },

    async create(userId: string, name: string, endpointValue: string) {
      const workspace = await current(userId);
      requireOwner(workspace);
      let endpoint: URL;
      try {
        endpoint = canonicalizeRemoteMcpUrl(endpointValue);
      } catch (error) {
        mapRemoteError(error);
      }
      const existing = await repository.list(
        workspace.workspace.id,
        workspace.membership.id,
      );
      const base = slugBase(name);
      const slug = existing.some((item) => item.server.slug === base)
        ? `${base.slice(0, 39)}-${createHash("sha256")
            .update(endpoint.toString())
            .digest("hex")
            .slice(0, 8)}`
        : base;
      try {
        const probed = await probeRemoteMcpServer(endpoint.toString(), slug);
        const created = await repository.create({
          authenticationKind: probed.authenticationKind,
          configuredByMembershipId: workspace.membership.id,
          endpointUrl: endpoint.toString(),
          name,
          slug,
          status:
            probed.authenticationKind === "none" ? "connected" : "disconnected",
          tools: probed.tools,
          workspaceId: workspace.workspace.id,
        });
        return toContract(await detail(workspace, created.id), workspace);
      } catch (error) {
        mapRemoteError(error);
      }
    },

    async disconnectAccount(userId: string, serverId: string): Promise<void> {
      const workspace = await current(userId);
      await detail(workspace, serverId);
      await repository.disconnectAccount(
        workspace.workspace.id,
        serverId,
        workspace.membership.id,
      );
    },

    async getDetail(userId: string, serverId: string) {
      const workspace = await current(userId);
      return toContract(await detail(workspace, serverId), workspace);
    },

    async list(userId: string): Promise<CustomMcpServerContract[]> {
      const workspace = await current(userId);
      const values = await repository.list(
        workspace.workspace.id,
        workspace.membership.id,
      );
      return Promise.all(
        values.map(async (value) =>
          toContract(await detail(workspace, value.server.id), workspace),
        ),
      );
    },

    async refreshTools(userId: string, serverId: string) {
      const workspace = await current(userId);
      requireOwner(workspace);
      const server = await detail(workspace, serverId);
      let credential: RemoteMcpCredential | null = null;
      if (server.server.authenticationKind !== "none") {
        if (server.account === null) {
          throw new HttpError(
            409,
            "CUSTOM_MCP_ACCOUNT_REQUIRED",
            "Connect your Custom MCP account first.",
          );
        }
        credential = readCredential(credentialEncryption, server.account);
      }
      try {
        const credentialSnapshot = JSON.stringify(credential);
        const tools = await discoverRemoteMcpTools(
          server.server.endpointUrl,
          server.server.slug,
          credential,
        );
        await persistRotatedCredential(
          workspace,
          server.account,
          credential,
          credentialSnapshot,
        );
        await repository.replaceCatalog({
          ownerMembershipId: workspace.membership.id,
          serverId,
          tools,
          workspaceId: workspace.workspace.id,
        });
        return toContract(await detail(workspace, serverId), workspace);
      } catch (error) {
        mapRemoteError(error);
      }
    },

    async rename(userId: string, serverId: string, name: string) {
      const workspace = await current(userId);
      requireOwner(workspace);
      await repository.rename(
        workspace.workspace.id,
        serverId,
        workspace.membership.id,
        name,
      );
      return toContract(await detail(workspace, serverId), workspace);
    },

    async replaceTools(
      userId: string,
      serverId: string,
      toolIds: readonly string[],
    ) {
      const workspace = await current(userId);
      requireOwner(workspace);
      await repository.replaceTools({
        ownerMembershipId: workspace.membership.id,
        serverId,
        toolIds,
        workspaceId: workspace.workspace.id,
      });
      return toContract(await detail(workspace, serverId), workspace);
    },

    async validate(userId: string, serverId: string) {
      const workspace = await current(userId);
      const server = await detail(workspace, serverId);
      const credential =
        server.server.authenticationKind === "none"
          ? null
          : server.account === null
            ? null
            : readCredential(credentialEncryption, server.account);
      if (server.server.authenticationKind !== "none" && credential === null) {
        throw new HttpError(
          409,
          "CUSTOM_MCP_ACCOUNT_REQUIRED",
          "Connect your Custom MCP account first.",
        );
      }
      try {
        const credentialSnapshot = JSON.stringify(credential);
        await discoverRemoteMcpTools(
          server.server.endpointUrl,
          server.server.slug,
          credential,
        );
        await persistRotatedCredential(
          workspace,
          server.account,
          credential,
          credentialSnapshot,
        );
        return { valid: true as const };
      } catch (error) {
        mapRemoteError(error);
      }
    },
  };
}
