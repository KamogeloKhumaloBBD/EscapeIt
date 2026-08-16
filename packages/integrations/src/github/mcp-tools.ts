import type {
  ActivityEvent,
  AppendActivityEventInput,
  MemberIntegrationAccess,
} from "@context-layer/db";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { McpPrincipal, McpToolProvider } from "../mcp-tool-provider";
import {
  ProviderAdapterError,
  type OAuthCredentials,
  type ProviderResource,
} from "../integration-adapter";
import {
  ProviderAccountRuntimeError,
  type ProviderAccountRuntime,
} from "../provider-account-runtime";
import type { GitHubAdapter } from "./adapter";
import { githubProvider, githubRepositoryScope } from "./definition";

const resourceSchema = z.object({
  externalId: z.string().regex(/^\d+$/),
  name: z.string().min(1),
  url: z.url(),
});
const repositoryIdSchema = z.string().regex(/^\d+$/).max(30);
const cursorSchema = z.string().regex(/^\d+$/).nullable().default(null);
const limitSchema = z.number().int().min(1).max(50).default(20);
const numberSchema = z.number().int().positive();
const branchSchema = z.string().trim().min(1).max(255);
const shaSchema = z.string().regex(/^[0-9a-f]{40}$/i);
const repositorySchema = z.object({
  archived: z.boolean(),
  defaultBranch: z.string(),
  description: z.string().nullable(),
  fullName: z.string(),
  id: z.string(),
  name: z.string(),
  private: z.boolean(),
  url: z.string(),
});
const fileSchema = z.object({
  content: z.string(),
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  size: z.number(),
  truncated: z.boolean(),
  url: z.string().nullable(),
});
const branchOutputSchema = z.object({
  name: z.string(),
  protected: z.boolean(),
  sha: z.string(),
});
const commitSchema = z.object({
  authoredAt: z.string().nullable(),
  author: z.string().nullable(),
  message: z.string(),
  sha: z.string(),
  url: z.string(),
});
const issueSchema = z.object({
  author: z.string().nullable(),
  body: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  labels: z.array(z.string()),
  number: z.number(),
  state: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  url: z.string(),
});
const commentSchema = z.object({
  author: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  id: z.string(),
  updatedAt: z.string(),
  url: z.string(),
});
const pullRequestSchema = z.object({
  author: z.string().nullable(),
  baseBranch: z.string(),
  baseSha: z.string(),
  body: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  draft: z.boolean(),
  headBranch: z.string(),
  headSha: z.string(),
  mergeable: z.boolean().nullable(),
  merged: z.boolean(),
  number: z.number(),
  state: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  url: z.string(),
});
const pullRequestFileSchema = z.object({
  additions: z.number(),
  changes: z.number(),
  deletions: z.number(),
  path: z.string(),
  previousPath: z.string().nullable(),
  sha: z.string(),
  status: z.string(),
});
const pageFields = { nextCursor: z.string().nullable() } as const;
const stateSchema = z.enum(["all", "closed", "open"]).default("open");

interface GitHubMcpRepository {
  appendActivity(input: AppendActivityEventInput): Promise<ActivityEvent>;
  findAccess(
    workspaceId: string,
    membershipId: string,
  ): Promise<MemberIntegrationAccess | null>;
}
interface ReadyGitHubAccess {
  access: MemberIntegrationAccess & {
    account: NonNullable<MemberIntegrationAccess["account"]>;
  };
  allowedRepositoryIds: readonly string[];
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

function readyAccess(
  access: MemberIntegrationAccess | null,
): ReadyGitHubAccess | null {
  if (
    access?.integration.status !== "connected" ||
    access.account?.status !== "connected" ||
    access.account.credentialEnvelope === null
  ) {
    return null;
  }
  const resource = resourceSchema.safeParse(access.integration.configuration);
  const allowedRepositoryIds = access.scopes
    .filter((scope) => scope.scopeKey === githubRepositoryScope)
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
      ? `Reconnect your GitHub account at ${reconnectUrl}, then try again.`
      : `Your stored GitHub credentials are unavailable. Reconnect your account at ${reconnectUrl}, then try again.`;
  }
  if (error instanceof ProviderAdapterError) {
    const messages: Record<ProviderAdapterError["code"], string> = {
      authorization_expired: `Your GitHub authorization has expired. Reconnect your account at ${reconnectUrl}, then try again.`,
      content_too_large: "The GitHub content exceeds the supported size limit.",
      forbidden: "Your GitHub account does not permit this operation.",
      inaccessible_resource:
        "The repository is outside the workspace allowlist or inaccessible.",
      invalid_request: "GitHub rejected the requested values or operation.",
      invalid_response:
        "GitHub returned content that could not be processed safely.",
      not_found: "The GitHub resource was not found or is not accessible.",
      temporarily_unavailable:
        "GitHub is temporarily unavailable or rate limited. Try again later.",
      unsupported_content:
        "The requested GitHub content type is not supported.",
    };
    return messages[error.code];
  }
  return "The GitHub request could not be completed.";
}
function toolFailure(message: string) {
  return { content: [{ text: message, type: "text" as const }], isError: true };
}
function toolSuccess(value: Record<string, unknown>) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: "text" as const }],
    structuredContent: value,
  };
}
function objectResultMetadata(
  key: string,
): (value: unknown) => Record<string, boolean | number | string> {
  return (value) => {
    if (typeof value !== "object" || value === null) return {};
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "string" || typeof candidate === "number"
      ? { [key]: candidate }
      : {};
  };
}

function pullRequestWorkflowMetadata(
  value: unknown,
): Record<string, boolean | number | string> {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const pullRequest = record.pullRequest;
  const number =
    typeof pullRequest === "object" && pullRequest !== null
      ? (pullRequest as Record<string, unknown>).number
      : undefined;
  return {
    ...(typeof record.branch === "string" ? { branch: record.branch } : {}),
    ...(typeof record.commitSha === "string"
      ? { commitSha: record.commitSha }
      : {}),
    ...(typeof number === "number" ? { pullRequestNumber: number } : {}),
  };
}

export function createGitHubMcpToolProvider({
  accountRuntime,
  adapter,
  publicAppUrl,
  repository,
}: {
  accountRuntime: ProviderAccountRuntime;
  adapter: GitHubAdapter;
  publicAppUrl: string;
  repository: GitHubMcpRepository;
}): McpToolProvider {
  const reconnectUrl = new URL("/integrations/github", publicAppUrl).toString();
  async function invoke<T>(
    principal: McpPrincipal,
    ready: ReadyGitHubAccess,
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
        provider: githubProvider,
        status: "started",
        subjectMembershipId: principal.membershipId,
        summary: "GitHub MCP tool invoked",
        workspaceId: principal.workspaceId,
      });
    } catch {
      return { error: "The GitHub request could not be audited. Try again." };
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
          provider: githubProvider,
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
          provider: githubProvider,
          status: "failed",
          subjectMembershipId: principal.membershipId,
          summary: "GitHub MCP tool failed",
          workspaceId: principal.workspaceId,
        }),
      ]);
      return { error: errorMessage(error, reconnectUrl) };
    }
    try {
      const event = await repository.appendActivity({
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
        provider: githubProvider,
        status: "succeeded",
        subjectMembershipId: principal.membershipId,
        summary: audit.summary,
        workspaceId: principal.workspaceId,
      });
      await repository.appendActivity({
        actorMembershipId: principal.membershipId,
        category: "mcp",
        correlationId: principal.correlationId,
        metadata: { providerEventId: event.id, toolName: audit.toolName },
        operation: "mcp.tool.complete",
        parentEventId: root.id,
        provider: githubProvider,
        status: "succeeded",
        subjectMembershipId: principal.membershipId,
        summary: "GitHub MCP tool completed",
        workspaceId: principal.workspaceId,
      });
    } catch {
      return { error: "The GitHub request could not be audited. Try again." };
    }
    return { value };
  }

  function execute<T>(
    principal: McpPrincipal,
    ready: ReadyGitHubAccess,
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
      const readAnnotations = {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      } as const;
      const writeAnnotations = {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      } as const;
      const run = async <T>(
        audit: ToolAudit,
        operation: (credentials: OAuthCredentials) => Promise<T>,
        shape: (value: T) => Record<string, unknown>,
      ) => {
        const result = await execute(principal, ready, audit, operation);
        return "error" in result
          ? toolFailure(result.error)
          : toolSuccess(shape(result.value));
      };

      if (enabled.has("github_get_myself")) {
        server.registerTool(
          "github_get_myself",
          {
            annotations: readAnnotations,
            description:
              "Return the GitHub identity used by the member who created this MCP token.",
            inputSchema: z.object({}),
            outputSchema: z.object({
              identity: z.object({
                displayName: z.string(),
                externalAccountId: z.string(),
              }),
            }),
            title: "Get my GitHub identity",
          },
          async () =>
            run(
              {
                operation: "github.identity.get",
                summary: "GitHub identity retrieved",
                toolName: "github_get_myself",
              },
              (credentials) => adapter.getIdentity(credentials),
              (identity) => ({ identity }),
            ),
        );
      }

      if (enabled.has("github_list_repositories")) {
        server.registerTool(
          "github_list_repositories",
          {
            annotations: readAnnotations,
            description:
              "List workspace-allowlisted repositories visible to your GitHub identity.",
            inputSchema: z.object({}),
            outputSchema: z.object({ repositories: z.array(repositorySchema) }),
            title: "List GitHub repositories",
          },
          async () =>
            run(
              {
                operation: "github.repository.list",
                summary: "GitHub repositories listed",
                toolName: "github_list_repositories",
              },
              (credentials) =>
                adapter.listAllowedRepositories(
                  credentials,
                  ready.resource,
                  ready.allowedRepositoryIds,
                ),
              (repositories) => ({ repositories }),
            ),
        );
      }

      if (enabled.has("github_get_repository")) {
        server.registerTool(
          "github_get_repository",
          {
            annotations: readAnnotations,
            description:
              "Retrieve one workspace-allowlisted GitHub repository.",
            inputSchema: z.object({ repositoryId: repositoryIdSchema }),
            outputSchema: z.object({ repository: repositorySchema }),
            title: "Get GitHub repository",
          },
          async ({ repositoryId }) =>
            run(
              {
                metadata: { repositoryId },
                operation: "github.repository.get",
                summary: "GitHub repository retrieved",
                toolName: "github_get_repository",
              },
              (credentials) =>
                adapter.getRepository(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                ),
              (selectedRepository) => ({ repository: selectedRepository }),
            ),
        );
      }

      if (enabled.has("github_get_file")) {
        server.registerTool(
          "github_get_file",
          {
            annotations: readAnnotations,
            description:
              "Read one UTF-8 text file, capped at 50,000 characters, from an allowlisted repository.",
            inputSchema: z.object({
              path: z.string().min(1).max(1_024),
              ref: z.string().min(1).max(255).optional(),
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({ file: fileSchema }),
            title: "Get GitHub file",
          },
          async ({ path, ref, repositoryId }) =>
            run(
              {
                metadata: { repositoryId },
                operation: "github.file.get",
                summary: "GitHub file retrieved",
                toolName: "github_get_file",
              },
              (credentials) =>
                adapter.getFile(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  path,
                  ref,
                ),
              (file) => ({ file }),
            ),
        );
      }

      if (enabled.has("github_search_code")) {
        server.registerTool(
          "github_search_code",
          {
            annotations: readAnnotations,
            description:
              "Search code within one allowlisted repository using a bounded text query.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              query: z.string().trim().min(1).max(256),
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({
              incomplete: z.boolean(),
              items: z.array(
                z.object({
                  fragments: z.array(z.string()),
                  name: z.string(),
                  path: z.string(),
                  sha: z.string(),
                  url: z.string(),
                }),
              ),
              ...pageFields,
              total: z.number(),
            }),
            title: "Search GitHub code",
          },
          async ({ cursor, limit, query, repositoryId }) =>
            run(
              {
                metadata: { repositoryId },
                operation: "github.code.search",
                summary: "GitHub code searched",
                toolName: "github_search_code",
              },
              (credentials) =>
                adapter.searchCode(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  query,
                  cursor,
                  limit,
                ),
              (result) => ({ ...result }),
            ),
        );
      }

      if (enabled.has("github_list_branches")) {
        server.registerTool(
          "github_list_branches",
          {
            annotations: readAnnotations,
            description: "List branches in an allowlisted GitHub repository.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({
              branches: z.array(branchOutputSchema),
              ...pageFields,
            }),
            title: "List GitHub branches",
          },
          async ({ cursor, limit, repositoryId }) =>
            run(
              {
                metadata: { repositoryId },
                operation: "github.branch.list",
                summary: "GitHub branches listed",
                toolName: "github_list_branches",
              },
              (credentials) =>
                adapter.listBranches(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  cursor,
                  limit,
                ),
              (result) => ({
                branches: result.items,
                nextCursor: result.nextCursor,
              }),
            ),
        );
      }

      if (enabled.has("github_list_commits")) {
        server.registerTool(
          "github_list_commits",
          {
            annotations: readAnnotations,
            description:
              "List commits from a branch or the default branch of an allowlisted repository.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              ref: z.string().min(1).max(255).optional(),
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({
              commits: z.array(commitSchema),
              ...pageFields,
            }),
            title: "List GitHub commits",
          },
          async ({ cursor, limit, ref, repositoryId }) =>
            run(
              {
                metadata: { repositoryId },
                operation: "github.commit.list",
                summary: "GitHub commits listed",
                toolName: "github_list_commits",
              },
              (credentials) =>
                adapter.listCommits(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  cursor,
                  limit,
                  ref,
                ),
              (result) => ({
                commits: result.items,
                nextCursor: result.nextCursor,
              }),
            ),
        );
      }

      if (enabled.has("github_get_commit")) {
        server.registerTool(
          "github_get_commit",
          {
            annotations: readAnnotations,
            description:
              "Retrieve one commit from an allowlisted GitHub repository.",
            inputSchema: z.object({
              repositoryId: repositoryIdSchema,
              sha: shaSchema,
            }),
            outputSchema: z.object({ commit: commitSchema }),
            title: "Get GitHub commit",
          },
          async ({ repositoryId, sha }) =>
            run(
              {
                metadata: { repositoryId },
                operation: "github.commit.get",
                summary: "GitHub commit retrieved",
                toolName: "github_get_commit",
              },
              (credentials) =>
                adapter.getCommit(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  sha,
                ),
              (value) => ({ commit: value }),
            ),
        );
      }

      if (enabled.has("github_list_issues")) {
        server.registerTool(
          "github_list_issues",
          {
            annotations: readAnnotations,
            description:
              "List issues, excluding pull requests, in an allowlisted repository.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              repositoryId: repositoryIdSchema,
              state: stateSchema,
            }),
            outputSchema: z.object({
              issues: z.array(issueSchema),
              ...pageFields,
            }),
            title: "List GitHub issues",
          },
          async ({ cursor, limit, repositoryId, state }) =>
            run(
              {
                metadata: { repositoryId },
                operation: "github.issue.list",
                summary: "GitHub issues listed",
                toolName: "github_list_issues",
              },
              (credentials) =>
                adapter.listIssues(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  cursor,
                  limit,
                  state,
                ),
              (result) => ({
                issues: result.items,
                nextCursor: result.nextCursor,
              }),
            ),
        );
      }

      if (enabled.has("github_get_issue")) {
        server.registerTool(
          "github_get_issue",
          {
            annotations: readAnnotations,
            description:
              "Retrieve one issue, excluding pull requests, from an allowlisted repository.",
            inputSchema: z.object({
              number: numberSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({ issue: issueSchema.nullable() }),
            title: "Get GitHub issue",
          },
          async ({ number, repositoryId }) =>
            run(
              {
                metadata: { issueNumber: number, repositoryId },
                operation: "github.issue.get",
                summary: "GitHub issue retrieved",
                toolName: "github_get_issue",
              },
              (credentials) =>
                adapter.getIssue(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  number,
                ),
              (value) => ({ issue: value }),
            ),
        );
      }

      if (enabled.has("github_get_issue_comments")) {
        server.registerTool(
          "github_get_issue_comments",
          {
            annotations: readAnnotations,
            description:
              "List conversation comments for an issue or pull request in an allowlisted repository.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              number: numberSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({
              comments: z.array(commentSchema),
              ...pageFields,
            }),
            title: "Get GitHub issue comments",
          },
          async ({ cursor, limit, number, repositoryId }) =>
            run(
              {
                metadata: { issueNumber: number, repositoryId },
                operation: "github.issue.comment.list",
                summary: "GitHub issue comments listed",
                toolName: "github_get_issue_comments",
              },
              (credentials) =>
                adapter.listIssueComments(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  number,
                  cursor,
                  limit,
                ),
              (result) => ({
                comments: result.items,
                nextCursor: result.nextCursor,
              }),
            ),
        );
      }

      if (enabled.has("github_list_pull_requests")) {
        server.registerTool(
          "github_list_pull_requests",
          {
            annotations: readAnnotations,
            description:
              "List pull requests in an allowlisted GitHub repository.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              repositoryId: repositoryIdSchema,
              state: stateSchema,
            }),
            outputSchema: z.object({
              pullRequests: z.array(pullRequestSchema),
              ...pageFields,
            }),
            title: "List GitHub pull requests",
          },
          async ({ cursor, limit, repositoryId, state }) =>
            run(
              {
                metadata: { repositoryId },
                operation: "github.pull-request.list",
                summary: "GitHub pull requests listed",
                toolName: "github_list_pull_requests",
              },
              (credentials) =>
                adapter.listPullRequests(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  cursor,
                  limit,
                  state,
                ),
              (result) => ({
                nextCursor: result.nextCursor,
                pullRequests: result.items,
              }),
            ),
        );
      }

      if (enabled.has("github_get_pull_request")) {
        server.registerTool(
          "github_get_pull_request",
          {
            annotations: readAnnotations,
            description:
              "Retrieve one pull request from an allowlisted GitHub repository.",
            inputSchema: z.object({
              number: numberSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({ pullRequest: pullRequestSchema }),
            title: "Get GitHub pull request",
          },
          async ({ number, repositoryId }) =>
            run(
              {
                metadata: { pullRequestNumber: number, repositoryId },
                operation: "github.pull-request.get",
                summary: "GitHub pull request retrieved",
                toolName: "github_get_pull_request",
              },
              (credentials) =>
                adapter.getPullRequest(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  number,
                ),
              (value) => ({ pullRequest: value }),
            ),
        );
      }

      if (enabled.has("github_get_pull_request_files")) {
        server.registerTool(
          "github_get_pull_request_files",
          {
            annotations: readAnnotations,
            description:
              "List bounded file-change metadata for a pull request in an allowlisted repository.",
            inputSchema: z.object({
              cursor: cursorSchema,
              limit: limitSchema,
              number: numberSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({
              files: z.array(pullRequestFileSchema),
              ...pageFields,
            }),
            title: "Get GitHub pull request files",
          },
          async ({ cursor, limit, number, repositoryId }) =>
            run(
              {
                metadata: { pullRequestNumber: number, repositoryId },
                operation: "github.pull-request.file.list",
                summary: "GitHub pull request files listed",
                toolName: "github_get_pull_request_files",
              },
              (credentials) =>
                adapter.listPullRequestFiles(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  number,
                  cursor,
                  limit,
                ),
              (result) => ({
                files: result.items,
                nextCursor: result.nextCursor,
              }),
            ),
        );
      }

      if (enabled.has("github_create_issue")) {
        server.registerTool(
          "github_create_issue",
          {
            annotations: writeAnnotations,
            description:
              "Create one issue in an allowlisted GitHub repository.",
            inputSchema: z.object({
              assignees: z
                .array(z.string().trim().min(1).max(39))
                .max(10)
                .optional(),
              body: z.string().max(50_000).optional(),
              labels: z
                .array(z.string().trim().min(1).max(100))
                .max(20)
                .optional(),
              repositoryId: repositoryIdSchema,
              title: z.string().trim().min(1).max(256),
            }),
            outputSchema: z.object({ issue: issueSchema }),
            title: "Create GitHub issue",
          },
          async ({ assignees, body, labels, repositoryId, title }) =>
            run(
              {
                metadata: { repositoryId },
                operation: "github.issue.create",
                resultMetadata: objectResultMetadata("number"),
                summary: "GitHub issue created",
                toolName: "github_create_issue",
              },
              (credentials) =>
                adapter.createIssue(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  {
                    ...(assignees === undefined ? {} : { assignees }),
                    ...(body === undefined ? {} : { body }),
                    ...(labels === undefined ? {} : { labels }),
                    title,
                  },
                ),
              (value) => ({ issue: value }),
            ),
        );
      }

      if (enabled.has("github_add_comment")) {
        server.registerTool(
          "github_add_comment",
          {
            annotations: writeAnnotations,
            description:
              "Add one conversation comment to an issue or pull request in an allowlisted repository.",
            inputSchema: z.object({
              body: z.string().trim().min(1).max(50_000),
              number: numberSchema,
              repositoryId: repositoryIdSchema,
            }),
            outputSchema: z.object({ comment: commentSchema }),
            title: "Add GitHub comment",
          },
          async ({ body, number, repositoryId }) =>
            run(
              {
                metadata: { issueNumber: number, repositoryId },
                operation: "github.issue.comment.create",
                resultMetadata: objectResultMetadata("id"),
                summary: "GitHub comment added",
                toolName: "github_add_comment",
              },
              (credentials) =>
                adapter.addComment(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  number,
                  body,
                ),
              (value) => ({ comment: value }),
            ),
        );
      }

      if (enabled.has("github_create_pull_request")) {
        server.registerTool(
          "github_create_pull_request",
          {
            annotations: writeAnnotations,
            description:
              "Open a draft or regular pull request between existing branches in one allowlisted repository.",
            inputSchema: z.object({
              baseBranch: branchSchema,
              body: z.string().max(50_000).optional(),
              draft: z.boolean().default(false),
              headBranch: branchSchema,
              repositoryId: repositoryIdSchema,
              title: z.string().trim().min(1).max(256),
            }),
            outputSchema: z.object({ pullRequest: pullRequestSchema }),
            title: "Create GitHub pull request",
          },
          async ({
            baseBranch,
            body,
            draft,
            headBranch,
            repositoryId,
            title,
          }) =>
            run(
              {
                metadata: { baseBranch, headBranch, repositoryId },
                operation: "github.pull-request.create",
                resultMetadata: objectResultMetadata("number"),
                summary: "GitHub pull request created",
                toolName: "github_create_pull_request",
              },
              (credentials) =>
                adapter.createPullRequest(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  {
                    baseBranch,
                    ...(body === undefined ? {} : { body }),
                    draft,
                    headBranch,
                    title,
                  },
                ),
              (value) => ({ pullRequest: value }),
            ),
        );
      }

      if (enabled.has("github_create_pull_request_with_changes")) {
        server.registerTool(
          "github_create_pull_request_with_changes",
          {
            annotations: { ...writeAnnotations, destructiveHint: true },
            description:
              "Create a new branch, one bounded UTF-8 text commit, and a draft or regular pull request in an allowlisted repository. Existing branches are never modified.",
            inputSchema: z.object({
              baseBranch: branchSchema,
              body: z.string().max(50_000).optional(),
              changes: z
                .array(
                  z.discriminatedUnion("operation", [
                    z.object({
                      content: z.string().max(1_048_576),
                      operation: z.literal("upsert"),
                      path: z.string().min(1).max(1_024),
                    }),
                    z.object({
                      operation: z.literal("delete"),
                      path: z.string().min(1).max(1_024),
                    }),
                  ]),
                )
                .min(1)
                .max(20),
              commitMessage: z.string().trim().min(1).max(10_000),
              draft: z.boolean().default(false),
              newBranch: branchSchema,
              repositoryId: repositoryIdSchema,
              title: z.string().trim().min(1).max(256),
            }),
            outputSchema: z.object({
              branch: z.string(),
              commitSha: z.string(),
              pullRequest: pullRequestSchema,
            }),
            title: "Create GitHub pull request with changes",
          },
          async ({
            baseBranch,
            body,
            changes,
            commitMessage,
            draft,
            newBranch,
            repositoryId,
            title,
          }) =>
            run(
              {
                metadata: {
                  baseBranch,
                  changeCount: changes.length,
                  newBranch,
                  repositoryId,
                },
                operation: "github.pull-request.create-with-changes",
                resultMetadata: pullRequestWorkflowMetadata,
                summary: "GitHub pull request with changes created",
                toolName: "github_create_pull_request_with_changes",
              },
              (credentials) =>
                adapter.createPullRequestWithChanges(
                  credentials,
                  ready.allowedRepositoryIds,
                  repositoryId,
                  {
                    baseBranch,
                    ...(body === undefined ? {} : { body }),
                    changes,
                    commitMessage,
                    draft,
                    newBranch,
                    title,
                  },
                ),
              (value) => ({ ...value }),
            ),
        );
      }
    },
  };
}
