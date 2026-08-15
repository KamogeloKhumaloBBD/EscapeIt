import type {
  ActivityEvent,
  AppendActivityEventInput,
  MemberIntegrationAccess,
} from "@context-layer/db";
import { parseProviderKey, parseScopeKey } from "@context-layer/db";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { createAdfDocumentSchema } from "../atlassian/adf-schema";
import {
  ConfluenceVersionConflictError,
  type ConfluenceAdapter,
  type ConfluenceAttachmentContent,
  type ConfluenceComment,
  type ConfluencePage,
} from "./adapter";
import {
  ProviderAdapterError,
  type OAuthCredentials,
  type ProviderResource,
} from "../integration-adapter";
import {
  ProviderAccountRuntimeError,
  type ProviderAccountRuntime,
} from "../provider-account-runtime";
import type { McpPrincipal, McpToolProvider } from "../mcp-tool-provider";

const confluenceProvider = parseProviderKey("confluence");
const confluenceSpaceScope = parseScopeKey("confluence.space");
const resourceSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  url: z.url(),
});
const idSchema = z.string().trim().min(1).max(100);
const cursorSchema = z.string().min(1).max(2_048).nullable().default(null);
const limitSchema = z.number().int().min(1).max(50).default(20);
const textValueSchema = z.object({
  markdown: z.string().nullable(),
  text: z.string().nullable(),
  truncated: z.boolean(),
});
const pageSummarySchema = z.object({
  createdAt: z.string().nullable(),
  id: z.string(),
  parentId: z.string().nullable(),
  spaceId: z.string(),
  status: z.string(),
  title: z.string(),
  updatedAt: z.string().nullable(),
  url: z.string(),
  version: z.number().int().nonnegative(),
});
const pageSchema = pageSummarySchema.extend({
  authorId: z.string().nullable(),
  body: textValueSchema,
  labels: z.array(z.string()),
});
const spaceSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  status: z.string(),
  type: z.string(),
  url: z.string(),
});
const commentSchema = z.object({
  authorId: z.string().nullable(),
  body: textValueSchema,
  createdAt: z.string().nullable(),
  id: z.string(),
  parentCommentId: z.string().nullable(),
  status: z.string(),
  type: z.enum(["footer", "inline"]),
  updatedAt: z.string().nullable(),
});
const attachmentMetadataSchema = z.object({
  author: z.string().nullable(),
  createdAt: z.string(),
  filename: z.string(),
  id: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
});
const identitySchema = z.object({
  displayName: z.string(),
  externalAccountId: z.string(),
});
const pageBodySchema = createAdfDocumentSchema(50_000).describe(
  "Native Atlassian Document Format document. Use heading, paragraph, text, lists, links, code blocks, blockquotes, rules, or tables; do not send Markdown text.",
);
const commentBodySchema = createAdfDocumentSchema(10_000).describe(
  "Native Atlassian Document Format document for the footer comment; do not send Markdown text.",
);

interface ConfluenceMcpRepository {
  appendActivity(input: AppendActivityEventInput): Promise<ActivityEvent>;
  findAccess(
    workspaceId: string,
    membershipId: string,
  ): Promise<MemberIntegrationAccess | null>;
}

interface ReadyConfluenceAccess {
  access: MemberIntegrationAccess & {
    account: NonNullable<MemberIntegrationAccess["account"]>;
  };
  allowedSpaceIds: readonly string[];
  resource: ProviderResource;
}

interface ToolAudit {
  metadata?: Record<string, boolean | number | string>;
  operation: string;
  resultMetadata?: (
    value: unknown,
  ) => Record<string, boolean | number | string>;
  summary: string;
  toolName: string;
}

class ConfluenceMcpToolError extends Error {
  constructor(
    readonly publicMessage = "The Confluence resource was not found or is not accessible.",
  ) {
    super(publicMessage);
    this.name = "ConfluenceMcpToolError";
  }
}

function readyAccess(
  access: MemberIntegrationAccess | null,
): ReadyConfluenceAccess | null {
  if (
    access?.integration.status !== "connected" ||
    access.account?.status !== "connected" ||
    access.account.credentialEnvelope === null
  ) {
    return null;
  }
  const resource = resourceSchema.safeParse(access.integration.configuration);
  const allowedSpaceIds = access.scopes
    .filter((scope) => scope.scopeKey === confluenceSpaceScope)
    .map((scope) => scope.externalId);
  if (!resource.success || allowedSpaceIds.length === 0) return null;
  return {
    access: { ...access, account: access.account },
    allowedSpaceIds,
    resource: resource.data,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ConfluenceMcpToolError) return error.publicMessage;
  if (error instanceof ConfluenceVersionConflictError) {
    return "The Confluence page changed since it was retrieved. Get the page again and retry with its current version.";
  }
  if (error instanceof ProviderAccountRuntimeError) {
    return error.code === "account_required"
      ? "Reconnect your Confluence account and try again."
      : "Your stored Confluence credentials are unavailable. Reconnect your account.";
  }
  if (error instanceof ProviderAdapterError) {
    const messages: Record<ProviderAdapterError["code"], string> = {
      authorization_expired:
        "Your Confluence authorization has expired. Reconnect your account and try again.",
      content_too_large:
        "The Confluence attachment exceeds the supported size limit.",
      forbidden: "Your Confluence account does not permit this operation.",
      inaccessible_resource:
        "The Confluence resource is outside the workspace allowlist or inaccessible.",
      invalid_request: "Confluence rejected the requested values.",
      invalid_response:
        "Confluence returned content that could not be processed safely.",
      not_found: "The Confluence resource was not found or is not accessible.",
      temporarily_unavailable:
        "Confluence is temporarily unavailable. Try again later.",
      unsupported_content: "This attachment type is not supported.",
    };
    return messages[error.code];
  }
  return "The Confluence request could not be completed.";
}

function toolFailure(message: string) {
  return {
    content: [{ text: message, type: "text" as const }],
    isError: true,
  };
}

function toolSuccess(value: Record<string, unknown>) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: "text" as const }],
    structuredContent: value,
  };
}

function pageResultMetadata(
  value: unknown,
): Record<string, boolean | number | string> {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const pageId = record.id;
  const version = record.version;
  return {
    ...(typeof pageId === "string" ? { pageId } : {}),
    ...(typeof version === "number" ? { resultingVersion: version } : {}),
  };
}

function commentResultMetadata(
  value: unknown,
): Record<string, boolean | number | string> {
  if (typeof value !== "object" || value === null) return {};
  const commentId = (value as Record<string, unknown>).id;
  return typeof commentId === "string" ? { commentId } : {};
}

export function createConfluenceMcpToolProvider({
  accountRuntime,
  adapter,
  repository,
}: {
  accountRuntime: ProviderAccountRuntime;
  adapter: ConfluenceAdapter;
  repository: ConfluenceMcpRepository;
}): McpToolProvider {
  async function invoke<T>(
    principal: McpPrincipal,
    ready: ReadyConfluenceAccess,
    audit: ToolAudit,
    operation: () => Promise<T>,
  ): Promise<{ error: string } | { value: T }> {
    let root: ActivityEvent;
    try {
      root = await repository.appendActivity({
        actorMembershipId: principal.membershipId,
        category: "mcp",
        correlationId: principal.correlationId,
        metadata: { toolName: audit.toolName },
        operation: "mcp.tool.invoke",
        provider: confluenceProvider,
        status: "started",
        subjectMembershipId: principal.membershipId,
        summary: "Confluence MCP tool invoked",
        workspaceId: principal.workspaceId,
      });
    } catch {
      return {
        error: "The Confluence request could not be audited. Try again.",
      };
    }

    let value: T;
    try {
      value = await operation();
    } catch (error) {
      await Promise.allSettled([
        repository.appendActivity({
          actorMembershipId: principal.membershipId,
          category: "integration",
          correlationId: principal.correlationId,
          metadata: { toolName: audit.toolName, ...audit.metadata },
          operation: audit.operation,
          parentEventId: root.id,
          provider: confluenceProvider,
          status: "failed",
          subjectMembershipId: principal.membershipId,
          summary: `${audit.summary} failed`,
          workspaceId: principal.workspaceId,
        }),
        repository.appendActivity({
          actorMembershipId: principal.membershipId,
          category: "mcp",
          correlationId: principal.correlationId,
          metadata: { toolName: audit.toolName },
          operation: "mcp.tool.complete",
          parentEventId: root.id,
          provider: confluenceProvider,
          status: "failed",
          subjectMembershipId: principal.membershipId,
          summary: "Confluence MCP tool failed",
          workspaceId: principal.workspaceId,
        }),
      ]);
      return { error: errorMessage(error) };
    }

    try {
      const providerEvent = await repository.appendActivity({
        actorMembershipId: principal.membershipId,
        category: "integration",
        correlationId: principal.correlationId,
        metadata: {
          toolName: audit.toolName,
          ...audit.metadata,
          ...audit.resultMetadata?.(value),
        },
        operation: audit.operation,
        parentEventId: root.id,
        provider: confluenceProvider,
        status: "succeeded",
        subjectMembershipId: principal.membershipId,
        summary: audit.summary,
        workspaceId: principal.workspaceId,
      });
      await repository.appendActivity({
        actorMembershipId: principal.membershipId,
        category: "mcp",
        correlationId: principal.correlationId,
        metadata: {
          providerEventId: providerEvent.id,
          toolName: audit.toolName,
        },
        operation: "mcp.tool.complete",
        parentEventId: root.id,
        provider: confluenceProvider,
        status: "succeeded",
        subjectMembershipId: principal.membershipId,
        summary: "Confluence MCP tool completed",
        workspaceId: principal.workspaceId,
      });
    } catch {
      return {
        error: "The Confluence request could not be audited. Try again.",
      };
    }
    return { value };
  }

  function execute<T>(
    principal: McpPrincipal,
    ready: ReadyConfluenceAccess,
    audit: ToolAudit,
    operation: (credentials: OAuthCredentials) => Promise<T>,
  ) {
    return invoke(principal, ready, audit, () =>
      accountRuntime.withCredentials(
        {
          account: ready.access.account,
          integration: ready.access.integration,
          membershipId: principal.membershipId,
          workspaceId: principal.workspaceId,
        },
        adapter,
        operation,
      ),
    );
  }

  return {
    async registerTools(server: McpServer, principal: McpPrincipal) {
      const ready = readyAccess(
        await repository.findAccess(
          principal.workspaceId,
          principal.membershipId,
        ),
      );
      if (ready === null) return;
      const enabled = new Set(ready.access.enabledMcpToolNames);
      const annotations = {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      } as const;

      if (enabled.has("confluence_get_myself")) {
        server.registerTool(
          "confluence_get_myself",
          {
            annotations,
            description:
              "Return the Confluence identity used by the member who created this workspace MCP token.",
            inputSchema: z.object({}),
            outputSchema: z.object({ identity: identitySchema }),
            title: "Get my Confluence identity",
          },
          async () => {
            const result = await execute(
              principal,
              ready,
              {
                operation: "confluence.identity.get",
                summary: "Confluence identity retrieved",
                toolName: "confluence_get_myself",
              },
              (credentials) => adapter.getIdentity(credentials),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ identity: result.value });
          },
        );
      }

      if (enabled.has("confluence_list_spaces")) {
        server.registerTool(
          "confluence_list_spaces",
          {
            annotations,
            description:
              "List workspace-allowlisted Confluence spaces visible to your account.",
            inputSchema: z.object({}),
            outputSchema: z.object({ spaces: z.array(spaceSchema) }),
            title: "List Confluence spaces",
          },
          async () => {
            const result = await execute(
              principal,
              ready,
              {
                operation: "confluence.space.list",
                summary: "Confluence spaces listed",
                toolName: "confluence_list_spaces",
              },
              (credentials) =>
                adapter.listAllowedSpaces(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ spaces: result.value });
          },
        );
      }

      if (enabled.has("confluence_list_pages")) {
        server.registerTool(
          "confluence_list_pages",
          {
            annotations,
            description:
              "List bounded pages in one allowlisted Confluence space.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              spaceId: idSchema,
            }),
            outputSchema: z.object({
              nextCursor: z.string().nullable(),
              pages: z.array(pageSummarySchema),
            }),
            title: "List Confluence pages",
          },
          async ({ cursor, limit, spaceId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { spaceId },
                operation: "confluence.page.list",
                summary: "Confluence pages listed",
                toolName: "confluence_list_pages",
              },
              (credentials) =>
                adapter.listPages(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  spaceId,
                  cursor,
                  limit,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({
                  nextCursor: result.value.nextCursor,
                  pages: result.value.items,
                });
          },
        );
      }

      if (enabled.has("confluence_get_page")) {
        server.registerTool(
          "confluence_get_page",
          {
            annotations,
            description:
              "Read one Confluence page when its space is allowlisted and visible to your account.",
            inputSchema: z.object({ pageId: idSchema }),
            outputSchema: z.object({ page: pageSchema }),
            title: "Get Confluence page",
          },
          async ({ pageId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { pageId },
                operation: "confluence.page.get",
                summary: "Confluence page retrieved",
                toolName: "confluence_get_page",
              },
              async (credentials) => {
                const page = await adapter.getPage(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  pageId,
                );
                if (page === null) throw new ConfluenceMcpToolError();
                return page;
              },
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ page: result.value });
          },
        );
      }

      if (enabled.has("confluence_search_pages")) {
        server.registerTool(
          "confluence_search_pages",
          {
            annotations,
            description:
              "Search page titles or text across allowlisted Confluence spaces using structured filters, never raw CQL.",
            inputSchema: z
              .object({
                cursor: cursorSchema,
                limit: limitSchema,
                spaceId: idSchema.optional(),
                text: z.string().trim().min(1).max(500).optional(),
                title: z.string().trim().min(1).max(500).optional(),
              })
              .refine(
                (value) =>
                  value.text !== undefined || value.title !== undefined,
                {
                  message: "Provide a title or text search value.",
                },
              ),
            outputSchema: z.object({
              nextCursor: z.string().nullable(),
              pages: z.array(pageSummarySchema.extend({ excerpt: z.string() })),
            }),
            title: "Search Confluence pages",
          },
          async ({ cursor, limit, spaceId, text, title }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: {
                  ...(spaceId === undefined ? {} : { spaceId }),
                  hasText: text !== undefined,
                  hasTitle: title !== undefined,
                },
                operation: "confluence.page.search",
                summary: "Confluence pages searched",
                toolName: "confluence_search_pages",
              },
              (credentials) =>
                adapter.searchPages(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  {
                    cursor,
                    limit,
                    ...(spaceId === undefined ? {} : { spaceId }),
                    ...(text === undefined ? {} : { text }),
                    ...(title === undefined ? {} : { title }),
                  },
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({
                  nextCursor: result.value.nextCursor,
                  pages: result.value.items,
                });
          },
        );
      }

      if (enabled.has("confluence_get_page_children")) {
        server.registerTool(
          "confluence_get_page_children",
          {
            annotations,
            description: "List bounded child pages beneath an accessible page.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              pageId: idSchema,
            }),
            outputSchema: z.object({
              nextCursor: z.string().nullable(),
              pages: z.array(pageSummarySchema),
            }),
            title: "Get Confluence page children",
          },
          async ({ cursor, limit, pageId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { pageId },
                operation: "confluence.page.children.list",
                summary: "Confluence page children listed",
                toolName: "confluence_get_page_children",
              },
              async (credentials) => {
                const page = await adapter.getPageChildren(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  pageId,
                  cursor,
                  limit,
                );
                if (page === null) throw new ConfluenceMcpToolError();
                return page;
              },
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({
                  nextCursor: result.value.nextCursor,
                  pages: result.value.items,
                });
          },
        );
      }

      if (enabled.has("confluence_get_page_comments")) {
        server.registerTool(
          "confluence_get_page_comments",
          {
            annotations,
            description:
              "Read bounded footer or inline comments from an accessible page.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              pageId: idSchema,
              type: z.enum(["footer", "inline"]).default("footer"),
            }),
            outputSchema: z.object({
              comments: z.array(commentSchema),
              nextCursor: z.string().nullable(),
            }),
            title: "Get Confluence page comments",
          },
          async ({ cursor, limit, pageId, type }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { commentType: type, pageId },
                operation: "confluence.page.comments.list",
                summary: "Confluence page comments retrieved",
                toolName: "confluence_get_page_comments",
              },
              async (credentials) => {
                const page = await adapter.getPageComments(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  pageId,
                  type,
                  cursor,
                  limit,
                );
                if (page === null) throw new ConfluenceMcpToolError();
                return page;
              },
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({
                  comments: result.value.items,
                  nextCursor: result.value.nextCursor,
                });
          },
        );
      }

      if (enabled.has("confluence_list_page_attachments")) {
        server.registerTool(
          "confluence_list_page_attachments",
          {
            annotations,
            description:
              "List bounded attachment metadata for an accessible Confluence page.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              pageId: idSchema,
            }),
            outputSchema: z.object({
              attachments: z.array(attachmentMetadataSchema),
              nextCursor: z.string().nullable(),
            }),
            title: "List Confluence page attachments",
          },
          async ({ cursor, limit, pageId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { pageId },
                operation: "confluence.page.attachments.list",
                summary: "Confluence page attachments listed",
                toolName: "confluence_list_page_attachments",
              },
              async (credentials) => {
                const page = await adapter.listPageAttachments(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  pageId,
                  cursor,
                  limit,
                );
                if (page === null) throw new ConfluenceMcpToolError();
                return page;
              },
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({
                  attachments: result.value.items,
                  nextCursor: result.value.nextCursor,
                });
          },
        );
      }

      if (enabled.has("confluence_get_page_attachment")) {
        server.registerTool(
          "confluence_get_page_attachment",
          {
            annotations,
            description:
              "Retrieve one supported attachment from an accessible Confluence page. Text, Markdown, PDF, and DOCX return extracted text; supported images return inline image content.",
            inputSchema: z.object({
              attachmentId: idSchema,
              pageId: idSchema,
            }),
            outputSchema: z.object({
              attachment: attachmentMetadataSchema,
              content: z.string().optional(),
              format: z.string().optional(),
              kind: z.enum(["image", "text"]),
              truncated: z.boolean().optional(),
            }),
            title: "Get Confluence page attachment",
          },
          async ({ attachmentId, pageId }) => {
            const result = await execute<ConfluenceAttachmentContent>(
              principal,
              ready,
              {
                metadata: { attachmentId, pageId },
                operation: "confluence.page.attachment.get",
                summary: "Confluence page attachment retrieved",
                toolName: "confluence_get_page_attachment",
              },
              async (credentials) => {
                const attachment = await adapter.getPageAttachment(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  pageId,
                  attachmentId,
                );
                if (attachment === null) {
                  throw new ConfluenceMcpToolError(
                    "The Confluence attachment was not found or is not accessible.",
                  );
                }
                return attachment;
              },
            );
            if ("error" in result) return toolFailure(result.error);
            if (result.value.kind === "text") {
              return toolSuccess({
                attachment: result.value.metadata,
                content: result.value.content,
                format: result.value.format,
                kind: "text",
                truncated: result.value.truncated,
              });
            }
            const structuredContent = {
              attachment: result.value.metadata,
              kind: "image" as const,
            };
            return {
              content: [
                {
                  text: JSON.stringify(structuredContent, null, 2),
                  type: "text" as const,
                },
                {
                  data: result.value.data,
                  mimeType: result.value.mimeType,
                  type: "image" as const,
                },
              ],
              structuredContent,
            };
          },
        );
      }

      if (enabled.has("confluence_create_page")) {
        server.registerTool(
          "confluence_create_page",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
              readOnlyHint: false,
            },
            description:
              "Create a published page in an allowlisted Confluence space using your connected account.",
            inputSchema: z.object({
              body: pageBodySchema.optional(),
              parentPageId: idSchema.optional(),
              spaceId: idSchema,
              title: z.string().trim().min(1).max(255),
            }),
            outputSchema: z.object({ page: pageSchema }),
            title: "Create Confluence page",
          },
          async ({ body, parentPageId, spaceId, title }) => {
            const result = await execute<ConfluencePage>(
              principal,
              ready,
              {
                metadata: {
                  ...(parentPageId === undefined ? {} : { parentPageId }),
                  spaceId,
                },
                operation: "confluence.page.create",
                resultMetadata: pageResultMetadata,
                summary: "Confluence page created",
                toolName: "confluence_create_page",
              },
              (credentials) =>
                adapter.createPage(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  {
                    spaceId,
                    title,
                    ...(body === undefined ? {} : { body }),
                    ...(parentPageId === undefined ? {} : { parentPageId }),
                  },
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ page: result.value });
          },
        );
      }

      if (enabled.has("confluence_update_page")) {
        server.registerTool(
          "confluence_update_page",
          {
            annotations: {
              destructiveHint: true,
              idempotentHint: false,
              openWorldHint: true,
              readOnlyHint: false,
            },
            description:
              "Update the title or body of an accessible published Confluence page using an expected version to prevent lost updates.",
            inputSchema: z
              .object({
                body: pageBodySchema.optional(),
                expectedVersion: z.number().int().min(1),
                pageId: idSchema,
                title: z.string().trim().min(1).max(255).optional(),
              })
              .refine(
                (value) =>
                  value.body !== undefined || value.title !== undefined,
                { message: "Provide a title or body update." },
              ),
            outputSchema: z.object({ page: pageSchema }),
            title: "Update Confluence page",
          },
          async ({ body, expectedVersion, pageId, title }) => {
            const result = await execute<ConfluencePage>(
              principal,
              ready,
              {
                metadata: { expectedVersion, pageId },
                operation: "confluence.page.update",
                resultMetadata: pageResultMetadata,
                summary: "Confluence page updated",
                toolName: "confluence_update_page",
              },
              async (credentials) => {
                const page = await adapter.updatePage(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  {
                    expectedVersion,
                    pageId,
                    ...(body === undefined ? {} : { body }),
                    ...(title === undefined ? {} : { title }),
                  },
                );
                if (page === null) throw new ConfluenceMcpToolError();
                return page;
              },
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ page: result.value });
          },
        );
      }

      if (enabled.has("confluence_add_page_comment")) {
        server.registerTool(
          "confluence_add_page_comment",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
              readOnlyHint: false,
            },
            description:
              "Add a bounded footer comment to an accessible Confluence page using your connected account.",
            inputSchema: z.object({
              body: commentBodySchema,
              pageId: idSchema,
            }),
            outputSchema: z.object({ comment: commentSchema }),
            title: "Add Confluence page comment",
          },
          async ({ body, pageId }) => {
            const result = await execute<ConfluenceComment>(
              principal,
              ready,
              {
                metadata: { pageId },
                operation: "confluence.page.comment.create",
                resultMetadata: commentResultMetadata,
                summary: "Confluence page comment added",
                toolName: "confluence_add_page_comment",
              },
              async (credentials) => {
                const comment = await adapter.addPageComment(
                  credentials,
                  ready.resource,
                  ready.allowedSpaceIds,
                  pageId,
                  body,
                );
                if (comment === null) throw new ConfluenceMcpToolError();
                return comment;
              },
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ comment: result.value });
          },
        );
      }
    },
  };
}
