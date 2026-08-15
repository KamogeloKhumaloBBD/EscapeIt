import type {
  ActivityEvent,
  AppendActivityEventInput,
  CustomMcpAccount,
  EncryptedCredentialEnvelope,
  ReadyCustomMcpAccess,
} from "@context-layer/db";
import type { CredentialEncryption } from "@context-layer/security";
import {
  fromJsonSchema,
  type JsonSchemaType,
  type McpServer,
  type Tool,
} from "@modelcontextprotocol/server";
import type { McpPrincipal } from "@context-layer/integrations";

import {
  invokeRemoteMcpTool,
  RemoteMcpError,
  type RemoteMcpCredential,
} from "./remote-mcp-client";

export interface CustomMcpGatewayToolProvider {
  registerTools(
    server: McpServer,
    principal: McpPrincipal,
    allowedServerIds: ReadonlySet<string> | null,
  ): Promise<void>;
}

interface CustomMcpToolRepository {
  appendActivity(input: AppendActivityEventInput): Promise<ActivityEvent>;
  listReady(
    workspaceId: string,
    membershipId: string,
    allowedServerIds: ReadonlySet<string> | null,
  ): Promise<ReadyCustomMcpAccess[]>;
  replaceCredentials(input: {
    accountId: string;
    credentialEnvelope: EncryptedCredentialEnvelope;
    expectedEnvelope: EncryptedCredentialEnvelope;
    workspaceId: string;
  }): Promise<CustomMcpAccount | null>;
}

function readCredential(
  encryption: CredentialEncryption,
  account: CustomMcpAccount | null,
): RemoteMcpCredential | null {
  if (account?.credentialEnvelope === null || account === null) return null;
  const value = encryption.decrypt(
    account.credentialEnvelope,
    "custom-mcp-account",
    account.id,
  );
  if (typeof value !== "object" || value === null) {
    throw new Error("Custom MCP credentials are unavailable.");
  }
  const record = value as Record<string, unknown>;
  const authMethod = record.authMethod;
  if (
    (authMethod === "bearer" && typeof record.token === "string") ||
    (authMethod === "oauth" &&
      typeof record.oauth === "object" &&
      record.oauth !== null)
  ) {
    return value as RemoteMcpCredential;
  }
  throw new Error("Custom MCP credentials are unavailable.");
}

function errorMessage(error: unknown): string {
  if (error instanceof RemoteMcpError) {
    if (error.code === "result_too_large") {
      return "The Custom MCP result exceeded the allowed size.";
    }
    if (error.code === "authorization_required") {
      return "Reconnect your Custom MCP account and try again.";
    }
  }
  return "The Custom MCP server could not complete the request. Try again.";
}

export function createCustomMcpGatewayToolProvider(input: {
  credentialEncryption: CredentialEncryption;
  repository: CustomMcpToolRepository;
}): CustomMcpGatewayToolProvider {
  return {
    async registerTools(server, principal, allowedServerIds) {
      const access = await input.repository.listReady(
        principal.workspaceId,
        principal.membershipId,
        allowedServerIds,
      );
      for (const ready of access) {
        for (const storedTool of ready.tools) {
          const annotations = {
            ...(typeof storedTool.annotations.destructiveHint === "boolean"
              ? { destructiveHint: storedTool.annotations.destructiveHint }
              : {}),
            ...(typeof storedTool.annotations.idempotentHint === "boolean"
              ? { idempotentHint: storedTool.annotations.idempotentHint }
              : {}),
            openWorldHint:
              typeof storedTool.annotations.openWorldHint === "boolean"
                ? storedTool.annotations.openWorldHint
                : true,
            readOnlyHint: storedTool.annotations.readOnlyHint === true,
          };
          const toolDefinition: Tool = {
            annotations,
            description: `Custom MCP tool from ${ready.server.name}. ${storedTool.description}`,
            inputSchema:
              storedTool.inputSchema as unknown as Tool["inputSchema"],
            name: storedTool.upstreamName,
            ...(storedTool.outputSchema === null
              ? {}
              : {
                  outputSchema: storedTool.outputSchema,
                }),
            ...(storedTool.title === null ? {} : { title: storedTool.title }),
          };
          server.registerTool(
            storedTool.exposedName,
            {
              annotations,
              description: `Custom MCP tool from ${ready.server.name}. ${storedTool.description}`,
              inputSchema: fromJsonSchema(
                toolDefinition.inputSchema as unknown as JsonSchemaType,
              ),
              ...(toolDefinition.outputSchema === undefined
                ? {}
                : {
                    outputSchema: fromJsonSchema(
                      toolDefinition.outputSchema as unknown as JsonSchemaType,
                    ),
                  }),
              title: storedTool.title ?? storedTool.exposedName,
            },
            async (argumentsValue) => {
              let root: ActivityEvent;
              try {
                root = await input.repository.appendActivity({
                  actorMembershipId: principal.membershipId,
                  category: "mcp",
                  correlationId: principal.correlationId,
                  metadata: {
                    customMcpServerId: ready.server.id,
                    toolName: storedTool.exposedName,
                  },
                  operation: "mcp.tool.invoke",
                  provider: null,
                  status: "started",
                  subjectMembershipId: principal.membershipId,
                  summary: "Custom MCP tool invoked",
                  workspaceId: principal.workspaceId,
                });
              } catch {
                return {
                  content: [
                    {
                      type: "text",
                      text: "The Custom MCP request could not be audited. Try again.",
                    },
                  ],
                  isError: true,
                };
              }
              try {
                const before = readCredential(
                  input.credentialEncryption,
                  ready.account,
                );
                const credentialSnapshot = JSON.stringify(before);
                const invoked = await invokeRemoteMcpTool({
                  arguments: argumentsValue as Record<string, unknown>,
                  credential: before,
                  endpointUrl: ready.server.endpointUrl,
                  tool: toolDefinition,
                });
                if (
                  ready.account?.credentialEnvelope !== null &&
                  ready.account !== null &&
                  invoked.credential?.authMethod === "oauth" &&
                  JSON.stringify(invoked.credential) !== credentialSnapshot
                ) {
                  const envelope = input.credentialEncryption.encrypt(
                    invoked.credential,
                    "custom-mcp-account",
                    ready.account.id,
                  );
                  await input.repository.replaceCredentials({
                    accountId: ready.account.id,
                    credentialEnvelope: envelope,
                    expectedEnvelope: ready.account.credentialEnvelope,
                    workspaceId: principal.workspaceId,
                  });
                }
                await input.repository.appendActivity({
                  actorMembershipId: principal.membershipId,
                  category: "mcp",
                  correlationId: principal.correlationId,
                  metadata: {
                    customMcpServerId: ready.server.id,
                    toolName: storedTool.exposedName,
                  },
                  operation: "mcp.tool.complete",
                  parentEventId: root.id,
                  provider: null,
                  status:
                    invoked.result.isError === true ? "failed" : "succeeded",
                  subjectMembershipId: principal.membershipId,
                  summary:
                    invoked.result.isError === true
                      ? "Custom MCP tool failed"
                      : "Custom MCP tool completed",
                  workspaceId: principal.workspaceId,
                });
                return invoked.result;
              } catch (error) {
                await Promise.allSettled([
                  input.repository.appendActivity({
                    actorMembershipId: principal.membershipId,
                    category: "mcp",
                    correlationId: principal.correlationId,
                    metadata: {
                      customMcpServerId: ready.server.id,
                      toolName: storedTool.exposedName,
                    },
                    operation: "mcp.tool.complete",
                    parentEventId: root.id,
                    provider: null,
                    status: "failed",
                    subjectMembershipId: principal.membershipId,
                    summary: "Custom MCP tool failed",
                    workspaceId: principal.workspaceId,
                  }),
                ]);
                return {
                  content: [{ type: "text", text: errorMessage(error) }],
                  isError: true,
                };
              }
            },
          );
        }
      }
    },
  };
}
