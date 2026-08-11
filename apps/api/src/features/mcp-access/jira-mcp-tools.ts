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
} from "../../integrations/integration-adapter";
import type {
  JiraAdapter,
  JiraCommentsResult,
  JiraIssueSearchInput,
  JiraSearchResult,
} from "../../integrations/jira-adapter";
import {
  ProviderAccountRuntimeError,
  type ProviderAccountRuntime,
} from "../../integrations/provider-account-runtime";
import type { McpPrincipal, McpToolProvider } from "./mcp-tool-provider";

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
  text: z.string().nullable(),
  truncated: z.boolean(),
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
  constructor() {
    super("The Jira resource is unavailable.");
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
    return "The Jira issue was not found or is not accessible.";
  }

  if (error instanceof ProviderAccountRuntimeError) {
    return error.code === "account_required"
      ? "Reconnect your Jira account and try again."
      : "Your stored Jira credentials are unavailable. Reconnect your account.";
  }

  if (error instanceof ProviderAdapterError) {
    return error.code === "authorization_expired"
      ? "Your Jira authorization has expired. Reconnect your account and try again."
      : "Jira is temporarily unavailable. Try again later.";
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
    },
  };
}
