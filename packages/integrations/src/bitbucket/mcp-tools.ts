import type {
  ActivityEvent,
  AppendActivityEventInput,
  MemberIntegrationAccess,
} from "@context-layer/db";
import { parseProviderKey, parseScopeKey } from "@context-layer/db";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { BitbucketAdapter } from "./adapter";
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

const bitbucketProvider = parseProviderKey("bitbucket");
const bitbucketRepositoryScope = parseScopeKey("bitbucket.repository");
const resourceSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  url: z.url(),
});
const identitySchema = z.object({
  displayName: z.string(),
  externalAccountId: z.string(),
});
const repositorySchema = z.object({
  description: z.string().nullable(),
  fullName: z.string(),
  isPrivate: z.boolean(),
  mainBranch: z.string().nullable(),
  updatedAt: z.string(),
  url: z.string(),
  uuid: z.string(),
});
const commitSchema = z.object({
  author: z.string(),
  createdAt: z.string(),
  hash: z.string(),
  message: z.string(),
  url: z.string(),
});
const commitDetailSchema = commitSchema.extend({
  diff: z.object({ text: z.string(), truncated: z.boolean() }),
});
const fileContentSchema = z.object({
  content: z.string(),
  path: z.string(),
  truncated: z.boolean(),
});
const codeMatchSchema = z.object({
  commitHash: z.string(),
  path: z.string(),
  repositoryId: z.string(),
  snippet: z.string(),
});
const pullRequestSchema = z.object({
  author: z.string(),
  createdAt: z.string(),
  description: z.string(),
  destinationBranch: z.string(),
  id: z.number(),
  sourceBranch: z.string(),
  state: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  url: z.string(),
});
const pullRequestCommentSchema = z.object({
  author: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  deleted: z.boolean(),
  id: z.number(),
});
const repositoryIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe(
    "Bitbucket repository UUID as returned by bitbucket_list_repositories, e.g. {abc12345-6789-...}",
  );
const pullRequestIdSchema = z.number().int().positive();
const refSchema = z.string().trim().min(1).max(200);
const pathSchema = z.string().trim().min(1).max(1_000);
const cursorSchema = z.string().min(1).max(4_096).nullable().default(null);
const limitSchema = z.number().int().min(1).max(50).default(20);
const pullRequestStateSchema = z.enum([
  "DECLINED",
  "MERGED",
  "OPEN",
  "SUPERSEDED",
]);

interface BitbucketMcpRepository {
  appendActivity(input: AppendActivityEventInput): Promise<ActivityEvent>;
  findAccess(
    workspaceId: string,
    membershipId: string,
  ): Promise<MemberIntegrationAccess | null>;
}

interface ReadyBitbucketAccess {
  access: MemberIntegrationAccess & {
    account: NonNullable<MemberIntegrationAccess["account"]>;
  };
  allowedRepositoryIds: readonly string[];
  resource: ProviderResource;
}

interface ToolAudit {
  metadata?: Record<string, boolean | number | string>;
  operation: string;
  summary: string;
  toolName: string;
}

function readyAccess(
  access: MemberIntegrationAccess | null,
): ReadyBitbucketAccess | null {
  if (
    access?.integration.status !== "connected" ||
    access.account?.status !== "connected" ||
    access.account.credentialEnvelope === null
  ) {
    return null;
  }
  const resource = resourceSchema.safeParse(access.integration.configuration);
  const allowedRepositoryIds = access.scopes
    .filter((scope) => scope.scopeKey === bitbucketRepositoryScope)
    .map((scope) => scope.externalId);
  if (!resource.success || allowedRepositoryIds.length === 0) return null;
  return {
    access: { ...access, account: access.account },
    allowedRepositoryIds,
    resource: resource.data,
  };
}

function errorMessage(error: unknown, reconnectUrl: string): string {
  if (error instanceof ProviderAccountRuntimeError) {
    return error.code === "account_required"
      ? `Reconnect your Bitbucket account at ${reconnectUrl}, then try again.`
      : `Your stored Bitbucket credentials are unavailable. Reconnect your account at ${reconnectUrl}, then try again.`;
  }
  if (error instanceof ProviderAdapterError) {
    const messages: Record<ProviderAdapterError["code"], string> = {
      authorization_expired: `Your Bitbucket authorization has expired. Reconnect your account at ${reconnectUrl}, then try again.`,
      content_too_large:
        "The Bitbucket content exceeds the supported size limit.",
      forbidden: "Your Bitbucket account does not permit this operation.",
      inaccessible_resource:
        "The Bitbucket resource is outside the workspace allowlist or inaccessible.",
      invalid_request: "Bitbucket rejected the requested values.",
      invalid_response:
        "Bitbucket returned content that could not be processed safely.",
      not_found: "The Bitbucket resource was not found or is not accessible.",
      temporarily_unavailable:
        "Bitbucket is temporarily unavailable. Try again later.",
      unsupported_content: "This content type is not supported.",
    };
    return messages[error.code];
  }
  return "The Bitbucket request could not be completed.";
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

export function createBitbucketMcpToolProvider({
  accountRuntime,
  adapter,
  publicAppUrl,
  repository,
}: {
  accountRuntime: ProviderAccountRuntime;
  adapter: BitbucketAdapter;
  publicAppUrl: string;
  repository: BitbucketMcpRepository;
}): McpToolProvider {
  const reconnectUrl = new URL(
    "/integrations/bitbucket",
    publicAppUrl,
  ).toString();
  async function invoke<T>(
    principal: McpPrincipal,
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
        provider: bitbucketProvider,
        status: "started",
        subjectMembershipId: principal.membershipId,
        summary: "Bitbucket MCP tool invoked",
        workspaceId: principal.workspaceId,
      });
    } catch {
      return {
        error: "The Bitbucket request could not be audited. Try again.",
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
          provider: bitbucketProvider,
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
          provider: bitbucketProvider,
          status: "failed",
          subjectMembershipId: principal.membershipId,
          summary: "Bitbucket MCP tool failed",
          workspaceId: principal.workspaceId,
        }),
      ]);
      return { error: errorMessage(error, reconnectUrl) };
    }

    try {
      const providerEvent = await repository.appendActivity({
        actorMembershipId: principal.membershipId,
        category: "integration",
        correlationId: principal.correlationId,
        metadata: { toolName: audit.toolName, ...audit.metadata },
        operation: audit.operation,
        parentEventId: root.id,
        provider: bitbucketProvider,
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
        provider: bitbucketProvider,
        status: "succeeded",
        subjectMembershipId: principal.membershipId,
        summary: "Bitbucket MCP tool completed",
        workspaceId: principal.workspaceId,
      });
    } catch {
      return {
        error: "The Bitbucket request could not be audited. Try again.",
      };
    }
    return { value };
  }

  function execute<T>(
    principal: McpPrincipal,
    ready: ReadyBitbucketAccess,
    audit: ToolAudit,
    operation: (credentials: OAuthCredentials) => Promise<T>,
  ) {
    return invoke(principal, audit, () =>
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

      if (enabled.has("bitbucket_get_myself")) {
        server.registerTool(
          "bitbucket_get_myself",
          {
            annotations,
            description:
              "Return the Bitbucket identity used by the member who created this workspace MCP token.",
            inputSchema: z.object({}),
            outputSchema: z.object({ identity: identitySchema }),
            title: "Get my Bitbucket identity",
          },
          async () => {
            const result = await execute(
              principal,
              ready,
              {
                operation: "bitbucket.identity.get",
                summary: "Bitbucket identity retrieved",
                toolName: "bitbucket_get_myself",
              },
              (credentials) => adapter.getIdentity(credentials),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ identity: result.value });
          },
        );
      }

      if (enabled.has("bitbucket_list_repositories")) {
        server.registerTool(
          "bitbucket_list_repositories",
          {
            annotations,
            description:
              "List workspace-allowlisted Bitbucket repositories visible to your account.",
            inputSchema: z.object({}),
            outputSchema: z.object({
              repositories: z.array(repositorySchema),
            }),
            title: "List Bitbucket repositories",
          },
          async () => {
            const result = await execute(
              principal,
              ready,
              {
                operation: "bitbucket.repository.list",
                summary: "Bitbucket repositories listed",
                toolName: "bitbucket_list_repositories",
              },
              (credentials) =>
                adapter.listAllowedRepositories(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ repositories: result.value });
          },
        );
      }

      if (enabled.has("bitbucket_get_repository")) {
        server.registerTool(
          "bitbucket_get_repository",
          {
            annotations,
            description: "Retrieve one allowlisted Bitbucket repository.",
            inputSchema: z.object({ repositoryId: repositoryIdSchema }),
            outputSchema: z.object({ repository: repositorySchema }),
            title: "Get Bitbucket repository",
          },
          async ({ repositoryId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { repositoryId },
                operation: "bitbucket.repository.get",
                summary: "Bitbucket repository retrieved",
                toolName: "bitbucket_get_repository",
              },
              (credentials) =>
                adapter.getRepository(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                  repositoryId,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ repository: result.value });
          },
        );
      }

      if (enabled.has("bitbucket_list_commits")) {
        server.registerTool(
          "bitbucket_list_commits",
          {
            annotations,
            description:
              "List bounded commits on a branch in an allowlisted repository. Omit branch to use the repository's default branch.",
            inputSchema: z.object({
              branch: refSchema.optional(),
              cursor: cursorSchema,
              limit: limitSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({
              commits: z.array(commitSchema),
              nextCursor: z.string().nullable(),
            }),
            title: "List Bitbucket commits",
          },
          async ({ branch, cursor, limit, repositoryId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: {
                  repositoryId,
                  ...(branch === undefined ? {} : { branch }),
                },
                operation: "bitbucket.commit.list",
                summary: "Bitbucket commits listed",
                toolName: "bitbucket_list_commits",
              },
              (credentials) =>
                adapter.listCommits(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  branch ?? null,
                  cursor,
                  limit,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({
                  commits: result.value.items,
                  nextCursor: result.value.nextCursor,
                });
          },
        );
      }

      if (enabled.has("bitbucket_get_commit")) {
        server.registerTool(
          "bitbucket_get_commit",
          {
            annotations,
            description:
              "Read one commit and its bounded diff from an allowlisted repository.",
            inputSchema: z.object({
              commitHash: refSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({ commit: commitDetailSchema }),
            title: "Get Bitbucket commit",
          },
          async ({ commitHash, repositoryId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { commitHash, repositoryId },
                operation: "bitbucket.commit.get",
                summary: "Bitbucket commit retrieved",
                toolName: "bitbucket_get_commit",
              },
              (credentials) =>
                adapter.getCommit(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  commitHash,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ commit: result.value });
          },
        );
      }

      if (enabled.has("bitbucket_get_file")) {
        server.registerTool(
          "bitbucket_get_file",
          {
            annotations,
            description:
              "Read bounded file content at a path and ref (branch or commit hash) in an allowlisted repository.",
            inputSchema: z.object({
              path: pathSchema,
              ref: refSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({ file: fileContentSchema }),
            title: "Get Bitbucket file",
          },
          async ({ path, ref, repositoryId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { path, ref, repositoryId },
                operation: "bitbucket.file.get",
                summary: "Bitbucket file retrieved",
                toolName: "bitbucket_get_file",
              },
              (credentials) =>
                adapter.getFile(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  path,
                  ref,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ file: result.value });
          },
        );
      }

      if (enabled.has("bitbucket_search_code")) {
        server.registerTool(
          "bitbucket_search_code",
          {
            annotations,
            description:
              "Search code across allowlisted repositories in the workspace.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              query: z.string().trim().min(1).max(200),
            }),
            outputSchema: z.object({
              matches: z.array(codeMatchSchema),
              nextCursor: z.string().nullable(),
            }),
            title: "Search Bitbucket code",
          },
          async ({ cursor, limit, query }) => {
            const result = await execute(
              principal,
              ready,
              {
                operation: "bitbucket.code.search",
                summary: "Bitbucket code searched",
                toolName: "bitbucket_search_code",
              },
              (credentials) =>
                adapter.searchCode(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                  query,
                  cursor,
                  limit,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({
                  matches: result.value.items,
                  nextCursor: result.value.nextCursor,
                });
          },
        );
      }

      if (enabled.has("bitbucket_list_pull_requests")) {
        server.registerTool(
          "bitbucket_list_pull_requests",
          {
            annotations,
            description:
              "List pull requests in an allowlisted repository, optionally filtered by state.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              repositoryId: repositoryIdSchema,
              state: pullRequestStateSchema.optional(),
            }),
            outputSchema: z.object({
              nextCursor: z.string().nullable(),
              pullRequests: z.array(pullRequestSchema),
            }),
            title: "List Bitbucket pull requests",
          },
          async ({ cursor, limit, repositoryId, state }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: {
                  repositoryId,
                  ...(state === undefined ? {} : { state }),
                },
                operation: "bitbucket.pullrequest.list",
                summary: "Bitbucket pull requests listed",
                toolName: "bitbucket_list_pull_requests",
              },
              (credentials) =>
                adapter.listPullRequests(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  state ?? null,
                  cursor,
                  limit,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({
                  nextCursor: result.value.nextCursor,
                  pullRequests: result.value.items,
                });
          },
        );
      }

      if (enabled.has("bitbucket_get_pull_request")) {
        server.registerTool(
          "bitbucket_get_pull_request",
          {
            annotations,
            description:
              "Retrieve one pull request from an allowlisted repository.",
            inputSchema: z.object({
              pullRequestId: pullRequestIdSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({ pullRequest: pullRequestSchema }),
            title: "Get Bitbucket pull request",
          },
          async ({ pullRequestId, repositoryId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { pullRequestId, repositoryId },
                operation: "bitbucket.pullrequest.get",
                summary: "Bitbucket pull request retrieved",
                toolName: "bitbucket_get_pull_request",
              },
              (credentials) =>
                adapter.getPullRequest(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  pullRequestId,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ pullRequest: result.value });
          },
        );
      }

      if (enabled.has("bitbucket_get_pull_request_diff")) {
        server.registerTool(
          "bitbucket_get_pull_request_diff",
          {
            annotations,
            description:
              "Read the bounded diff for a pull request in an allowlisted repository.",
            inputSchema: z.object({
              pullRequestId: pullRequestIdSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({
              diff: z.object({ text: z.string(), truncated: z.boolean() }),
            }),
            title: "Get Bitbucket pull request diff",
          },
          async ({ pullRequestId, repositoryId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { pullRequestId, repositoryId },
                operation: "bitbucket.pullrequest.diff.get",
                summary: "Bitbucket pull request diff retrieved",
                toolName: "bitbucket_get_pull_request_diff",
              },
              (credentials) =>
                adapter.getPullRequestDiff(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  pullRequestId,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ diff: result.value });
          },
        );
      }

      if (enabled.has("bitbucket_list_pull_request_comments")) {
        server.registerTool(
          "bitbucket_list_pull_request_comments",
          {
            annotations,
            description:
              "List bounded comments on a pull request in an allowlisted repository.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              pullRequestId: pullRequestIdSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({
              comments: z.array(pullRequestCommentSchema),
              nextCursor: z.string().nullable(),
            }),
            title: "List Bitbucket pull request comments",
          },
          async ({ cursor, limit, pullRequestId, repositoryId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { pullRequestId, repositoryId },
                operation: "bitbucket.pullrequest.comments.list",
                summary: "Bitbucket pull request comments retrieved",
                toolName: "bitbucket_list_pull_request_comments",
              },
              (credentials) =>
                adapter.listPullRequestComments(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  pullRequestId,
                  cursor,
                  limit,
                ),
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
    },
  };
}
