import type {
  ActivityEvent,
  AppendActivityEventInput,
  MemberIntegrationAccess,
} from "@context-layer/db";
import { parseProviderKey, parseScopeKey } from "@context-layer/db";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  ProviderAdapterError,
  type OAuthCredentials,
  type ProviderResource,
} from "../integration-adapter";
import type {
  JiraAdapter,
  JiraAttachmentContent,
  JiraChangelogPage,
  JiraCommentsResult,
  JiraCreateIssueInput,
  JiraIssueSearchInput,
  JiraSearchResult,
  JiraWorklogPage,
} from "./adapter";
import {
  ProviderAccountRuntimeError,
  type ProviderAccountRuntime,
} from "../provider-account-runtime";
import type { McpPrincipal, McpToolProvider } from "../mcp-tool-provider";

const jiraProvider = parseProviderKey("jira");
const jiraProjectScope = parseScopeKey("jira.project");
const resourceSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  url: z.url(),
});
const issueKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9]*-[1-9][0-9]*$/)
  .describe("Jira issue key, for example ENG-184");
const statusSchema = z.string().trim().min(1).max(100);
const limitSchema = z.number().int().min(1).max(50).default(20);
const textValueSchema = z.object({
  markdown: z.string().nullable(),
  text: z.string().nullable(),
  truncated: z.boolean(),
});
const startAtSchema = z.number().int().min(0).default(0);
const projectIdSchema = z.string().trim().min(1).max(100);
const transitionIdSchema = z.string().trim().min(1).max(100);
const attachmentIdSchema = z.string().trim().min(1).max(100);
const identitySchema = z.object({
  displayName: z.string(),
  externalAccountId: z.string(),
});
const issueSummarySchema = z.object({
  assignee: z.string().nullable(),
  id: z.string(),
  issueType: z.string(),
  key: z.string(),
  priority: z.string().nullable(),
  project: z.object({ id: z.string(), key: z.string(), name: z.string() }),
  status: z.object({ category: z.string().nullable(), name: z.string() }),
  summary: z.string(),
  updatedAt: z.string(),
  url: z.string(),
});
const issueSchema = issueSummarySchema.extend({
  components: z.array(z.object({ id: z.string(), name: z.string() })),
  createdAt: z.string(),
  description: textValueSchema,
  labels: z.array(z.string()),
  parent: z
    .object({ key: z.string(), summary: z.string().nullable() })
    .nullable(),
  reporter: z.string().nullable(),
});
const commentSchema = z.object({
  author: z.string(),
  body: textValueSchema,
  createdAt: z.string(),
  id: z.string(),
  updatedAt: z.string(),
  visibility: z.string().nullable(),
});
const projectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  url: z.string(),
});
const attachmentMetadataSchema = z.object({
  author: z.string().nullable(),
  createdAt: z.string(),
  filename: z.string(),
  id: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
});
const transitionSchema = z.object({
  hasScreen: z.boolean(),
  id: z.string(),
  name: z.string(),
  to: z.object({ id: z.string(), name: z.string() }),
});

interface JiraMcpRepository {
  appendActivity(input: AppendActivityEventInput): Promise<ActivityEvent>;
  findAccess(
    workspaceId: string,
    membershipId: string,
  ): Promise<MemberIntegrationAccess | null>;
}

interface ReadyJiraAccess {
  access: MemberIntegrationAccess & {
    account: NonNullable<MemberIntegrationAccess["account"]>;
  };
  allowedProjectIds: readonly string[];
  resource: ProviderResource;
}

interface ToolAudit {
  metadata?: Record<string, boolean | number | string>;
  operation: string;
  summary: string;
  toolName: string;
}

class JiraMcpToolError extends Error {
  constructor(
    readonly publicMessage = "The Jira resource was not found or is not accessible.",
  ) {
    super(publicMessage);
    this.name = "JiraMcpToolError";
  }
}

function readyAccess(
  access: MemberIntegrationAccess | null,
): ReadyJiraAccess | null {
  if (
    access?.integration.status !== "connected" ||
    access.account?.status !== "connected" ||
    access.account.credentialEnvelope === null
  ) {
    return null;
  }

  const resource = resourceSchema.safeParse(access.integration.configuration);
  const allowedProjectIds = access.scopes
    .filter((scope) => scope.scopeKey === jiraProjectScope)
    .map((scope) => scope.externalId);

  if (!resource.success || allowedProjectIds.length === 0) {
    return null;
  }

  return {
    access: {
      ...access,
      account: access.account,
    },
    allowedProjectIds,
    resource: resource.data,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof JiraMcpToolError) {
    return error.publicMessage;
  }

  if (error instanceof ProviderAccountRuntimeError) {
    return error.code === "account_required"
      ? "Reconnect your Jira account and try again."
      : "Your stored Jira credentials are unavailable. Reconnect your account.";
  }

  if (error instanceof ProviderAdapterError) {
    const messages: Record<ProviderAdapterError["code"], string> = {
      authorization_expired:
        "Your Jira authorization has expired. Reconnect your account and try again.",
      content_too_large:
        "The Jira attachment exceeds the supported size limit.",
      forbidden: "Your Jira account does not permit this operation.",
      inaccessible_resource:
        "The Jira resource is outside the workspace allowlist or inaccessible.",
      invalid_request: "Jira rejected the requested values or operation.",
      invalid_response:
        "Jira returned content that could not be processed safely.",
      not_found: "The Jira resource was not found or is not accessible.",
      temporarily_unavailable:
        "Jira is temporarily unavailable. Try again later.",
      unsupported_content: "This attachment type is not supported.",
    };
    return messages[error.code];
  }

  return "The Jira request could not be completed.";
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

export function createJiraMcpToolProvider({
  accountRuntime,
  adapter,
  repository,
}: {
  accountRuntime: ProviderAccountRuntime;
  adapter: JiraAdapter;
  repository: JiraMcpRepository;
}): McpToolProvider {
  async function invoke<T>(
    principal: McpPrincipal,
    ready: ReadyJiraAccess,
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
        provider: jiraProvider,
        status: "started",
        subjectMembershipId: principal.membershipId,
        summary: "Jira MCP tool invoked",
        workspaceId: principal.workspaceId,
      });
    } catch {
      return { error: "The Jira request could not be audited. Try again." };
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
          provider: jiraProvider,
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
          provider: jiraProvider,
          status: "failed",
          subjectMembershipId: principal.membershipId,
          summary: "Jira MCP tool failed",
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
        metadata: { toolName: audit.toolName, ...audit.metadata },
        operation: audit.operation,
        parentEventId: root.id,
        provider: jiraProvider,
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
        provider: jiraProvider,
        status: "succeeded",
        subjectMembershipId: principal.membershipId,
        summary: "Jira MCP tool completed",
        workspaceId: principal.workspaceId,
      });
    } catch {
      return { error: "The Jira request could not be audited. Try again." };
    }

    return { value };
  }

  function execute<T>(
    principal: McpPrincipal,
    ready: ReadyJiraAccess,
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

      if (ready === null) {
        return;
      }

      const enabledTools = new Set(ready.access.enabledMcpToolNames);

      if (enabledTools.has("jira_get_myself")) {
        server.registerTool(
          "jira_get_myself",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "Return the Jira identity used by the member who created this workspace MCP token.",
            inputSchema: z.object({}),
            outputSchema: z.object({ identity: identitySchema }),
            title: "Get my Jira identity",
          },
          async () => {
            const result = await execute(
              principal,
              ready,
              {
                operation: "jira.identity.get",
                summary: "Jira identity retrieved",
                toolName: "jira_get_myself",
              },
              (credentials) => adapter.getIdentity(credentials),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ identity: result.value });
          },
        );
      }

      if (enabledTools.has("jira_get_issue")) {
        server.registerTool(
          "jira_get_issue",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "Get one Jira issue when its project is allowed for this workspace and visible to your Jira account.",
            inputSchema: z.object({ issueKey: issueKeySchema }),
            outputSchema: z.object({ issue: issueSchema }),
            title: "Get Jira issue",
          },
          async ({ issueKey }) => {
            const normalizedIssueKey = issueKey.toUpperCase();
            const result = await execute(
              principal,
              ready,
              {
                metadata: { issueKey: normalizedIssueKey },
                operation: "jira.issue.get",
                summary: "Jira issue retrieved",
                toolName: "jira_get_issue",
              },
              async (credentials) => {
                const issue = await adapter.getIssue(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  normalizedIssueKey,
                );

                if (issue === null) {
                  throw new JiraMcpToolError();
                }

                return issue;
              },
            );

            if ("error" in result) {
              return toolFailure(result.error);
            }

            return toolSuccess({ issue: result.value });
          },
        );
      }

      if (enabledTools.has("jira_search_issues")) {
        server.registerTool(
          "jira_search_issues",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "Search allowed Jira projects using validated text, project, status, and assignee filters.",
            inputSchema: z.object({
              assignedToMe: z.boolean().optional().default(false),
              limit: limitSchema,
              projectKey: z
                .string()
                .trim()
                .min(1)
                .max(64)
                .regex(/^[A-Za-z][A-Za-z0-9]*$/)
                .optional(),
              statuses: z.array(statusSchema).max(10).optional(),
              text: z.string().trim().min(1).max(200),
            }),
            outputSchema: z.object({
              issues: z.array(issueSummarySchema),
              returnedCount: z.number().int().nonnegative(),
            }),
            title: "Search Jira issues",
          },
          async ({ assignedToMe, limit, projectKey, statuses, text }) => {
            const searchInput: JiraIssueSearchInput = {
              assignedToMe,
              limit,
              ...(projectKey === undefined
                ? {}
                : { projectKey: projectKey.toUpperCase() }),
              ...(statuses === undefined
                ? {}
                : { statuses: [...new Set(statuses)] }),
              text,
            };
            const auditMetadata: Record<string, number | string> = {
              ...(searchInput.projectKey === undefined
                ? {}
                : { projectKey: searchInput.projectKey }),
            };
            const result = await execute<JiraSearchResult>(
              principal,
              ready,
              {
                metadata: auditMetadata,
                operation: "jira.issue.search",
                summary: "Jira issues searched",
                toolName: "jira_search_issues",
              },
              async (credentials) => {
                const response = await adapter.searchIssues(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  searchInput,
                );
                auditMetadata.returnedCount = response.returnedCount;
                return response;
              },
            );

            if ("error" in result) {
              return toolFailure(result.error);
            }

            return toolSuccess({
              issues: result.value.issues,
              returnedCount: result.value.returnedCount,
            });
          },
        );
      }

      if (enabledTools.has("jira_get_assigned_issues")) {
        server.registerTool(
          "jira_get_assigned_issues",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "List Jira issues assigned to your connected Jira identity within allowed workspace projects.",
            inputSchema: z.object({
              limit: limitSchema,
              statuses: z.array(statusSchema).max(10).optional(),
            }),
            outputSchema: z.object({
              issues: z.array(issueSummarySchema),
              returnedCount: z.number().int().nonnegative(),
            }),
            title: "Get my assigned Jira issues",
          },
          async ({ limit, statuses }) => {
            const searchInput: JiraIssueSearchInput = {
              assignedToMe: true,
              limit,
              ...(statuses === undefined
                ? {}
                : { statuses: [...new Set(statuses)] }),
            };
            const auditMetadata: Record<string, number> = {};
            const result = await execute<JiraSearchResult>(
              principal,
              ready,
              {
                metadata: auditMetadata,
                operation: "jira.issue.assigned.list",
                summary: "Assigned Jira issues retrieved",
                toolName: "jira_get_assigned_issues",
              },
              async (credentials) => {
                const response = await adapter.searchIssues(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  searchInput,
                );
                auditMetadata.returnedCount = response.returnedCount;
                return response;
              },
            );

            if ("error" in result) {
              return toolFailure(result.error);
            }

            return toolSuccess({
              issues: result.value.issues,
              returnedCount: result.value.returnedCount,
            });
          },
        );
      }

      if (enabledTools.has("jira_get_issue_comments")) {
        server.registerTool(
          "jira_get_issue_comments",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "Get comments for an accessible Jira issue after enforcing the workspace project allowlist.",
            inputSchema: z.object({
              issueKey: issueKeySchema,
              limit: limitSchema,
            }),
            outputSchema: z.object({
              comments: z.array(commentSchema),
              issue: issueSummarySchema,
              returnedCount: z.number().int().nonnegative(),
              total: z.number().int().nonnegative(),
            }),
            title: "Get Jira issue comments",
          },
          async ({ issueKey, limit }) => {
            const normalizedIssueKey = issueKey.toUpperCase();
            const auditMetadata: Record<string, number | string> = {
              issueKey: normalizedIssueKey,
            };
            const result = await execute<JiraCommentsResult>(
              principal,
              ready,
              {
                metadata: auditMetadata,
                operation: "jira.issue.comments.list",
                summary: "Jira issue comments retrieved",
                toolName: "jira_get_issue_comments",
              },
              async (credentials) => {
                const comments = await adapter.getIssueComments(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  normalizedIssueKey,
                  limit,
                );

                if (comments === null) {
                  throw new JiraMcpToolError();
                }

                auditMetadata.returnedCount = comments.returnedCount;
                return comments;
              },
            );

            if ("error" in result) {
              return toolFailure(result.error);
            }

            return toolSuccess({ ...result.value });
          },
        );
      }

      if (enabledTools.has("jira_list_projects")) {
        server.registerTool(
          "jira_list_projects",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "List workspace-allowlisted Jira projects visible to your connected Jira identity.",
            inputSchema: z.object({}),
            outputSchema: z.object({
              projects: z.array(projectSchema),
              returnedCount: z.number().int().nonnegative(),
            }),
            title: "List Jira projects",
          },
          async () => {
            const auditMetadata: Record<string, number> = {};
            const result = await execute(
              principal,
              ready,
              {
                metadata: auditMetadata,
                operation: "jira.project.list",
                summary: "Jira projects listed",
                toolName: "jira_list_projects",
              },
              async (credentials) => {
                const projects = await adapter.listAllowedProjects(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                );
                auditMetadata.returnedCount = projects.length;
                return projects;
              },
            );
            if ("error" in result) return toolFailure(result.error);
            return toolSuccess({
              projects: result.value,
              returnedCount: result.value.length,
            });
          },
        );
      }

      if (enabledTools.has("jira_get_create_metadata")) {
        server.registerTool(
          "jira_get_create_metadata",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "List issue types your Jira identity may create in an allowed project.",
            inputSchema: z.object({ projectId: projectIdSchema }),
            outputSchema: z.object({
              issueTypes: z.array(
                z.object({
                  description: z.string(),
                  id: z.string(),
                  name: z.string(),
                  subtask: z.boolean(),
                }),
              ),
              projectId: z.string(),
            }),
            title: "Get Jira create metadata",
          },
          async ({ projectId }) => {
            const result = await execute(
              principal,
              ready,
              {
                metadata: { projectId },
                operation: "jira.issue.create-metadata.get",
                summary: "Jira create metadata retrieved",
                toolName: "jira_get_create_metadata",
              },
              (credentials) =>
                adapter.getCreateMetadata(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  projectId,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ issueTypes: result.value, projectId });
          },
        );
      }

      if (enabledTools.has("jira_get_issue_changelog")) {
        server.registerTool(
          "jira_get_issue_changelog",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "Read bounded field and status history for an accessible Jira issue.",
            inputSchema: z.object({
              issueKey: issueKeySchema,
              limit: limitSchema,
              startAt: startAtSchema,
            }),
            outputSchema: z.object({
              histories: z.array(
                z.object({
                  author: z.string().nullable(),
                  createdAt: z.string(),
                  id: z.string(),
                  items: z.array(
                    z.object({
                      field: z.string(),
                      from: z.string().nullable(),
                      to: z.string().nullable(),
                    }),
                  ),
                }),
              ),
              nextStartAt: z.number().int().nonnegative().nullable(),
              total: z.number().int().nonnegative(),
            }),
            title: "Get Jira issue changelog",
          },
          async ({ issueKey, limit, startAt }) => {
            const normalized = issueKey.toUpperCase();
            const result = await execute<JiraChangelogPage>(
              principal,
              ready,
              {
                metadata: { issueKey: normalized, startAt },
                operation: "jira.issue.changelog.list",
                summary: "Jira issue changelog retrieved",
                toolName: "jira_get_issue_changelog",
              },
              async (credentials) => {
                const page = await adapter.getIssueChangelog(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  normalized,
                  startAt,
                  limit,
                );
                if (page === null) throw new JiraMcpToolError();
                return page;
              },
            );
            if ("error" in result) return toolFailure(result.error);
            return toolSuccess({ ...result.value });
          },
        );
      }

      if (enabledTools.has("jira_get_issue_transitions")) {
        server.registerTool(
          "jira_get_issue_transitions",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "List transitions currently available to your Jira identity for an accessible issue.",
            inputSchema: z.object({ issueKey: issueKeySchema }),
            outputSchema: z.object({ transitions: z.array(transitionSchema) }),
            title: "Get Jira issue transitions",
          },
          async ({ issueKey }) => {
            const normalized = issueKey.toUpperCase();
            const result = await execute(
              principal,
              ready,
              {
                metadata: { issueKey: normalized },
                operation: "jira.issue.transitions.list",
                summary: "Jira issue transitions listed",
                toolName: "jira_get_issue_transitions",
              },
              async (credentials) => {
                const transitions = await adapter.getIssueTransitions(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  normalized,
                );
                if (transitions === null) throw new JiraMcpToolError();
                return transitions;
              },
            );
            if ("error" in result) return toolFailure(result.error);
            return toolSuccess({ transitions: result.value });
          },
        );
      }

      if (enabledTools.has("jira_get_issue_worklogs")) {
        server.registerTool(
          "jira_get_issue_worklogs",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "Read bounded worklogs visible to your Jira identity for an accessible issue.",
            inputSchema: z.object({
              issueKey: issueKeySchema,
              limit: limitSchema,
              startAt: startAtSchema,
            }),
            outputSchema: z.object({
              nextStartAt: z.number().int().nonnegative().nullable(),
              total: z.number().int().nonnegative(),
              worklogs: z.array(
                z.object({
                  author: z.string(),
                  comment: textValueSchema,
                  createdAt: z.string(),
                  id: z.string(),
                  startedAt: z.string(),
                  timeSpent: z.string(),
                  timeSpentSeconds: z.number().int().nonnegative(),
                  updatedAt: z.string(),
                }),
              ),
            }),
            title: "Get Jira issue worklogs",
          },
          async ({ issueKey, limit, startAt }) => {
            const normalized = issueKey.toUpperCase();
            const result = await execute<JiraWorklogPage>(
              principal,
              ready,
              {
                metadata: { issueKey: normalized, startAt },
                operation: "jira.issue.worklogs.list",
                summary: "Jira issue worklogs retrieved",
                toolName: "jira_get_issue_worklogs",
              },
              async (credentials) => {
                const page = await adapter.getIssueWorklogs(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  normalized,
                  startAt,
                  limit,
                );
                if (page === null) throw new JiraMcpToolError();
                return page;
              },
            );
            if ("error" in result) return toolFailure(result.error);
            return toolSuccess({ ...result.value });
          },
        );
      }

      if (enabledTools.has("jira_list_issue_attachments")) {
        server.registerTool(
          "jira_list_issue_attachments",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "List bounded attachment metadata for an accessible Jira issue.",
            inputSchema: z.object({ issueKey: issueKeySchema }),
            outputSchema: z.object({
              attachments: z.array(attachmentMetadataSchema),
              issue: issueSummarySchema,
              total: z.number().int().nonnegative(),
              truncated: z.boolean(),
            }),
            title: "List Jira issue attachments",
          },
          async ({ issueKey }) => {
            const normalized = issueKey.toUpperCase();
            const result = await execute(
              principal,
              ready,
              {
                metadata: { issueKey: normalized },
                operation: "jira.issue.attachments.list",
                summary: "Jira issue attachments listed",
                toolName: "jira_list_issue_attachments",
              },
              async (credentials) => {
                const attachments = await adapter.listIssueAttachments(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  normalized,
                );
                if (attachments === null) throw new JiraMcpToolError();
                return attachments;
              },
            );
            if ("error" in result) return toolFailure(result.error);
            return toolSuccess({ ...result.value });
          },
        );
      }

      if (enabledTools.has("jira_get_issue_attachment")) {
        server.registerTool(
          "jira_get_issue_attachment",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: true,
              readOnlyHint: true,
            },
            description:
              "Retrieve one supported attachment from an accessible Jira issue. Text, Markdown, PDF, and DOCX return extracted text; supported images return inline image content.",
            inputSchema: z.object({
              attachmentId: attachmentIdSchema,
              issueKey: issueKeySchema,
            }),
            outputSchema: z.object({
              attachment: attachmentMetadataSchema,
              content: z.string().optional(),
              format: z.string().optional(),
              kind: z.enum(["image", "text"]),
              truncated: z.boolean().optional(),
            }),
            title: "Get Jira issue attachment",
          },
          async ({ attachmentId, issueKey }) => {
            const normalized = issueKey.toUpperCase();
            const result = await execute<JiraAttachmentContent>(
              principal,
              ready,
              {
                metadata: { attachmentId, issueKey: normalized },
                operation: "jira.issue.attachment.get",
                summary: "Jira issue attachment retrieved",
                toolName: "jira_get_issue_attachment",
              },
              async (credentials) => {
                const attachment = await adapter.getIssueAttachment(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  normalized,
                  attachmentId,
                );
                if (attachment === null)
                  throw new JiraMcpToolError(
                    "The Jira attachment was not found or is not accessible.",
                  );
                return attachment;
              },
            );
            if ("error" in result) return toolFailure(result.error);
            if (result.value.kind === "text")
              return toolSuccess({
                attachment: result.value.metadata,
                content: result.value.content,
                format: result.value.format,
                kind: "text",
                truncated: result.value.truncated,
              });
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

      if (enabledTools.has("jira_create_issue")) {
        server.registerTool(
          "jira_create_issue",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
              readOnlyHint: false,
            },
            description:
              "Create one issue in an allowed Jira project using validated core fields.",
            inputSchema: z.object({
              description: z.string().trim().min(1).max(20_000).optional(),
              issueTypeId: z.string().min(1).max(100),
              labels: z
                .array(z.string().trim().min(1).max(255))
                .max(20)
                .optional(),
              parentIssueKey: issueKeySchema.optional(),
              projectId: projectIdSchema,
              summary: z.string().trim().min(1).max(255),
            }),
            outputSchema: z.object({ issue: issueSchema }),
            title: "Create Jira issue",
          },
          async ({
            description,
            issueTypeId,
            labels,
            parentIssueKey,
            projectId,
            summary,
          }) => {
            if (labels !== undefined && new Set(labels).size !== labels.length)
              return toolFailure("Duplicate labels are not allowed.");
            const input: JiraCreateIssueInput = {
              issueTypeId,
              projectId,
              summary,
              ...(description === undefined ? {} : { description }),
              ...(labels === undefined ? {} : { labels }),
              ...(parentIssueKey === undefined
                ? {}
                : { parentIssueKey: parentIssueKey.toUpperCase() }),
            };
            const result = await execute(
              principal,
              ready,
              {
                metadata: { projectId },
                operation: "jira.issue.create",
                summary: "Jira issue created",
                toolName: "jira_create_issue",
              },
              (credentials) =>
                adapter.createIssue(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  input,
                ),
            );
            return "error" in result
              ? toolFailure(result.error)
              : toolSuccess({ issue: result.value });
          },
        );
      }

      if (enabledTools.has("jira_add_comment")) {
        server.registerTool(
          "jira_add_comment",
          {
            annotations: {
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
              readOnlyHint: false,
            },
            description: "Add one bounded comment to an accessible Jira issue.",
            inputSchema: z.object({
              body: z.string().trim().min(1).max(10_000),
              issueKey: issueKeySchema,
            }),
            outputSchema: z.object({ comment: commentSchema }),
            title: "Add Jira comment",
          },
          async ({ body, issueKey }) => {
            const normalized = issueKey.toUpperCase();
            const result = await execute(
              principal,
              ready,
              {
                metadata: { issueKey: normalized },
                operation: "jira.issue.comment.create",
                summary: "Jira issue comment added",
                toolName: "jira_add_comment",
              },
              async (credentials) => {
                const comment = await adapter.addComment(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  normalized,
                  body,
                );
                if (comment === null) throw new JiraMcpToolError();
                return comment;
              },
            );
            if ("error" in result) return toolFailure(result.error);
            return toolSuccess({ comment: result.value });
          },
        );
      }

      if (enabledTools.has("jira_transition_issue")) {
        server.registerTool(
          "jira_transition_issue",
          {
            annotations: {
              destructiveHint: true,
              idempotentHint: false,
              openWorldHint: true,
              readOnlyHint: false,
            },
            description:
              "Apply one currently available transition to an accessible Jira issue.",
            inputSchema: z.object({
              issueKey: issueKeySchema,
              transitionId: transitionIdSchema,
            }),
            outputSchema: z.object({ issue: issueSchema }),
            title: "Transition Jira issue",
          },
          async ({ issueKey, transitionId }) => {
            const normalized = issueKey.toUpperCase();
            const result = await execute(
              principal,
              ready,
              {
                metadata: { issueKey: normalized, transitionId },
                operation: "jira.issue.transition",
                summary: "Jira issue transitioned",
                toolName: "jira_transition_issue",
              },
              async (credentials) => {
                const issue = await adapter.transitionIssue(
                  credentials,
                  ready.resource,
                  ready.allowedProjectIds,
                  normalized,
                  transitionId,
                );
                if (issue === null) throw new JiraMcpToolError();
                return issue;
              },
            );
            if ("error" in result) return toolFailure(result.error);
            return toolSuccess({ issue: result.value });
          },
        );
      }
    },
  };
}
