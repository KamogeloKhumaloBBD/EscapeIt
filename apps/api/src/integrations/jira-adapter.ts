import { parseProviderKey, parseScopeKey } from "@context-layer/db";
import { z } from "zod";

import { createAtlassianOAuthClient } from "./atlassian-oauth-client";
import {
  ProviderAdapterError,
  type IntegrationAdapter,
  type OAuthCredentials,
  type ProviderResource,
  type ScopeDiscoveryPage,
} from "./integration-adapter";

const jiraProviderKey = parseProviderKey("jira");
const jiraProjectScopeKey = parseScopeKey("jira.project");
const maximumDescriptionCharacters = 20_000;
const maximumCommentCharacters = 10_000;

const projectPageSchema = z.object({
  isLast: z.boolean(),
  startAt: z.number().int().nonnegative(),
  values: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string().min(1),
      name: z.string().min(1),
    }),
  ),
});

const jiraUserSchema = z.object({
  accountId: z.string().min(1).optional(),
  displayName: z.string().min(1),
});

const jiraProjectSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
});

const jiraIssueSchema = z.object({
  fields: z.object({
    assignee: jiraUserSchema.nullable().optional(),
    components: z
      .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
      .default([]),
    created: z.string().min(1),
    description: z.unknown().nullable().optional(),
    issuetype: z.object({ name: z.string().min(1) }),
    labels: z.array(z.string()).default([]),
    parent: z
      .object({
        fields: z.object({ summary: z.string().min(1) }).optional(),
        key: z.string().min(1),
      })
      .nullable()
      .optional(),
    priority: z
      .object({ name: z.string().min(1) })
      .nullable()
      .optional(),
    project: jiraProjectSchema,
    reporter: jiraUserSchema.nullable().optional(),
    status: z.object({
      name: z.string().min(1),
      statusCategory: z.object({ name: z.string().min(1) }).optional(),
    }),
    summary: z.string().min(1),
    updated: z.string().min(1),
  }),
  id: z.string().min(1),
  key: z.string().min(1),
});

const issueSearchSchema = z.object({
  issues: z.array(jiraIssueSchema),
});

const commentsPageSchema = z.object({
  comments: z.array(
    z.object({
      author: jiraUserSchema,
      body: z.unknown(),
      created: z.string().min(1),
      id: z.string().min(1),
      updated: z.string().min(1),
      visibility: z
        .object({ value: z.string().min(1).optional() })
        .nullable()
        .optional(),
    }),
  ),
  total: z.number().int().nonnegative(),
});

export const jiraOAuthScopes = [
  "offline_access",
  "read:me",
  "read:jira-user",
  "read:jira-work",
  "write:jira-work",
] as const;

export interface JiraTextValue {
  text: string | null;
  truncated: boolean;
}

export interface JiraIssueSummary {
  assignee: string | null;
  id: string;
  issueType: string;
  key: string;
  priority: string | null;
  project: {
    id: string;
    key: string;
    name: string;
  };
  status: {
    category: string | null;
    name: string;
  };
  summary: string;
  updatedAt: string;
  url: string;
}

export interface JiraIssue extends JiraIssueSummary {
  components: readonly { id: string; name: string }[];
  createdAt: string;
  description: JiraTextValue;
  labels: readonly string[];
  parent: { key: string; summary: string | null } | null;
  reporter: string | null;
}

export interface JiraComment {
  author: string;
  body: JiraTextValue;
  createdAt: string;
  id: string;
  updatedAt: string;
  visibility: string | null;
}

export interface JiraIssueSearchInput {
  assignedToMe?: boolean;
  limit: number;
  projectKey?: string;
  statuses?: readonly string[];
  text?: string;
}

export interface JiraSearchResult {
  issues: readonly JiraIssueSummary[];
  returnedCount: number;
}

export interface JiraCommentsResult {
  comments: readonly JiraComment[];
  issue: JiraIssueSummary;
  returnedCount: number;
  total: number;
}

export interface JiraAdapter extends IntegrationAdapter {
  getIssue(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
  ): Promise<JiraIssue | null>;
  getIssueComments(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
    limit: number,
  ): Promise<JiraCommentsResult | null>;
  searchIssues(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    input: JiraIssueSearchInput,
  ): Promise<JiraSearchResult>;
}

function toIsoDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ProviderAdapterError("invalid_response");
  }

  return date.toISOString();
}

function normalizePlainText(value: string): string {
  return value
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function adfToPlainText(
  value: unknown,
  maximumCharacters: number,
): JiraTextValue {
  if (value === null || value === undefined) {
    return { text: null, truncated: false };
  }

  if (typeof value === "string") {
    const normalized = normalizePlainText(value);
    return {
      text: normalized.slice(0, maximumCharacters) || null,
      truncated: normalized.length > maximumCharacters,
    };
  }

  const chunks: string[] = [];
  let visitedNodes = 0;
  let truncated = false;

  function visit(node: unknown): void {
    if (visitedNodes >= 20_000) {
      truncated = true;
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    if (typeof node !== "object" || node === null) {
      return;
    }

    visitedNodes += 1;
    const record = node as Record<string, unknown>;
    const type = record.type;
    const text = record.text;

    if (typeof text === "string") {
      chunks.push(text);
    } else if (type === "hardBreak") {
      chunks.push("\n");
    }

    const content = record.content;
    if (Array.isArray(content)) {
      visit(content);
    }

    if (
      type === "paragraph" ||
      type === "heading" ||
      type === "blockquote" ||
      type === "codeBlock" ||
      type === "listItem"
    ) {
      chunks.push("\n");
    }
  }

  visit(value);
  const normalized = normalizePlainText(chunks.join(""));

  if (normalized.length > maximumCharacters) {
    truncated = true;
  }

  return {
    text: normalized.slice(0, maximumCharacters) || null,
    truncated,
  };
}

function jiraString(value: string): string {
  return JSON.stringify(value);
}

function allowedProjectsClause(allowedProjectIds: readonly string[]): string {
  if (allowedProjectIds.length === 0) {
    throw new ProviderAdapterError("inaccessible_resource");
  }

  return `project in (${allowedProjectIds.map(jiraString).join(", ")})`;
}

function buildJql(
  allowedProjectIds: readonly string[],
  input: Omit<JiraIssueSearchInput, "limit"> & { issueKey?: string },
): string {
  const clauses = [allowedProjectsClause(allowedProjectIds)];

  if (input.issueKey !== undefined) {
    clauses.push(`key = ${jiraString(input.issueKey)}`);
  }

  if (input.text !== undefined) {
    clauses.push(`text ~ ${jiraString(input.text)}`);
  }

  if (input.projectKey !== undefined) {
    clauses.push(`project = ${jiraString(input.projectKey)}`);
  }

  if (input.statuses !== undefined && input.statuses.length > 0) {
    clauses.push(`status in (${input.statuses.map(jiraString).join(", ")})`);
  }

  if (input.assignedToMe === true) {
    clauses.push("assignee = currentUser()");
  }

  return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}

function issueUrl(resource: ProviderResource, issueKey: string): string {
  return `${resource.url.replace(/\/$/, "")}/browse/${encodeURIComponent(issueKey)}`;
}

function toIssueSummary(
  value: z.infer<typeof jiraIssueSchema>,
  resource: ProviderResource,
): JiraIssueSummary {
  return {
    assignee: value.fields.assignee?.displayName ?? null,
    id: value.id,
    issueType: value.fields.issuetype.name,
    key: value.key,
    priority: value.fields.priority?.name ?? null,
    project: { ...value.fields.project },
    status: {
      category: value.fields.status.statusCategory?.name ?? null,
      name: value.fields.status.name,
    },
    summary: value.fields.summary,
    updatedAt: toIsoDate(value.fields.updated),
    url: issueUrl(resource, value.key),
  };
}

function toIssue(
  value: z.infer<typeof jiraIssueSchema>,
  resource: ProviderResource,
): JiraIssue {
  return {
    ...toIssueSummary(value, resource),
    components: value.fields.components.map((component) => ({ ...component })),
    createdAt: toIsoDate(value.fields.created),
    description: adfToPlainText(
      value.fields.description,
      maximumDescriptionCharacters,
    ),
    labels: value.fields.labels,
    parent:
      value.fields.parent === null || value.fields.parent === undefined
        ? null
        : {
            key: value.fields.parent.key,
            summary: value.fields.parent.fields?.summary ?? null,
          },
    reporter: value.fields.reporter?.displayName ?? null,
  };
}

export function createJiraAdapter(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): JiraAdapter {
  const oauth = createAtlassianOAuthClient({
    ...config,
    scopes: jiraOAuthScopes,
  });

  async function discoverProjects(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    query: string,
    startAt: number,
  ): Promise<ScopeDiscoveryPage> {
    const url = new URL(
      `https://api.atlassian.com/ex/jira/${encodeURIComponent(resource.externalId)}/rest/api/3/project/search`,
    );
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("orderBy", "name");
    url.searchParams.set("startAt", String(startAt));

    if (query.length > 0) {
      url.searchParams.set("query", query);
    }

    const parsed = projectPageSchema.safeParse(
      await oauth.getJson(url.toString(), credentials.accessToken),
    );

    if (!parsed.success) {
      throw new ProviderAdapterError("invalid_response");
    }

    return {
      items: parsed.data.values.map((project) => ({
        displayName: `${project.name} (${project.key})`,
        externalId: project.id,
        scopeKey: jiraProjectScopeKey,
      })),
      nextCursor: parsed.data.isLast
        ? null
        : String(parsed.data.startAt + parsed.data.values.length),
    };
  }

  async function search(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    jql: string,
    limit: number,
  ): Promise<readonly z.infer<typeof jiraIssueSchema>[]> {
    const endpoint = `https://api.atlassian.com/ex/jira/${encodeURIComponent(resource.externalId)}/rest/api/3/search/jql`;
    const parsed = issueSearchSchema.safeParse(
      await oauth.postJson(endpoint, credentials.accessToken, {
        fields: [
          "assignee",
          "components",
          "created",
          "description",
          "issuetype",
          "labels",
          "parent",
          "priority",
          "project",
          "reporter",
          "status",
          "summary",
          "updated",
        ],
        jql,
        maxResults: limit,
      }),
    );

    if (!parsed.success) {
      throw new ProviderAdapterError("invalid_response");
    }

    return parsed.data.issues;
  }

  const adapter: JiraAdapter = {
    buildAuthorizationUrl: (state) => oauth.buildAuthorizationUrl(state),
    discoverResources: (credentials) => oauth.discoverResources(credentials),
    async discoverScopes(credentials, resource, query, cursor) {
      const startAt = cursor === null ? 0 : Number.parseInt(cursor, 10);

      if (!Number.isSafeInteger(startAt) || startAt < 0) {
        throw new ProviderAdapterError("invalid_response");
      }

      return discoverProjects(credentials, resource, query, startAt);
    },
    exchangeAuthorizationCode: (code) => oauth.exchangeAuthorizationCode(code),
    async getIssue(credentials, resource, allowedProjectIds, issueKey) {
      const issues = await search(
        credentials,
        resource,
        buildJql(allowedProjectIds, { issueKey }),
        1,
      );
      const issue = issues[0];
      return issue === undefined ? null : toIssue(issue, resource);
    },
    async getIssueComments(
      credentials,
      resource,
      allowedProjectIds,
      issueKey,
      limit,
    ) {
      const issues = await search(
        credentials,
        resource,
        buildJql(allowedProjectIds, { issueKey }),
        1,
      );
      const issue = issues[0];

      if (issue === undefined) {
        return null;
      }

      const url = new URL(
        `https://api.atlassian.com/ex/jira/${encodeURIComponent(resource.externalId)}/rest/api/3/issue/${encodeURIComponent(issue.key)}/comment`,
      );
      url.searchParams.set("maxResults", String(limit));
      url.searchParams.set("startAt", "0");
      const parsed = commentsPageSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      return {
        comments: parsed.data.comments.map((comment) => ({
          author: comment.author.displayName,
          body: adfToPlainText(comment.body, maximumCommentCharacters),
          createdAt: toIsoDate(comment.created),
          id: comment.id,
          updatedAt: toIsoDate(comment.updated),
          visibility: comment.visibility?.value ?? null,
        })),
        issue: toIssueSummary(issue, resource),
        returnedCount: parsed.data.comments.length,
        total: parsed.data.total,
      };
    },
    getIdentity: (credentials) => oauth.getIdentity(credentials),
    provider: jiraProviderKey,
    refreshCredentials: (credentials) => oauth.refreshCredentials(credentials),
    async resolveScopes(credentials, resource, externalIds) {
      const pending = new Set(externalIds);
      const resolved = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const page = await discoverProjects(
          credentials,
          resource,
          "",
          cursor === null ? 0 : Number.parseInt(cursor, 10),
        );

        for (const scope of page.items) {
          if (pending.delete(scope.externalId)) {
            resolved.push(scope);
          }
        }

        cursor = page.nextCursor;
        pages += 1;
      } while (pending.size > 0 && cursor !== null && pages < 40);

      if (pending.size > 0) {
        throw new ProviderAdapterError(
          "inaccessible_resource",
          "One or more Jira projects are unavailable.",
        );
      }

      return resolved;
    },
    async searchIssues(credentials, resource, allowedProjectIds, input) {
      const issues = await search(
        credentials,
        resource,
        buildJql(allowedProjectIds, input),
        input.limit,
      );
      const normalized = issues.map((issue) => toIssueSummary(issue, resource));
      return { issues: normalized, returnedCount: normalized.length };
    },
  };

  return adapter;
}
