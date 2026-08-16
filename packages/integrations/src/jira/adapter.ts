import { parseProviderKey, parseScopeKey } from "@context-layer/db";
import { z } from "zod";

import { createJiraOAuthClient } from "./oauth-client";
import {
  adfToTextValue,
  extractAttachment,
  maximumAttachmentBytes,
  textToAdf,
  type AttachmentMetadata,
  type JiraAttachmentContent,
  type JiraTextValue,
} from "./content";
import {
  ProviderAdapterError,
  type IntegrationAdapter,
  type OAuthCredentials,
  type ProviderResource,
  type ScopeDiscoveryPage,
} from "../integration-adapter";

const jiraProviderKey = parseProviderKey("jira");
const jiraProjectScopeKey = parseScopeKey("jira.project");
const maximumDescriptionCharacters = 20_000;
const maximumCommentCharacters = 10_000;
const issueFields = [
  "attachment",
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
] as const;

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

const attachmentSchema = z.object({
  author: jiraUserSchema.optional(),
  created: z.string().min(1),
  filename: z.string().min(1).max(500),
  id: z.union([z.string(), z.number()]).transform(String),
  mimeType: z.string().min(1).max(200),
  size: z.number().int().nonnegative(),
});

const jiraProjectSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
});

const jiraIssueSchema = z.object({
  fields: z.object({
    attachment: z.array(attachmentSchema).default([]),
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

const createMetadataSchema = z.object({
  issueTypes: z.array(
    z.object({
      description: z.string().default(""),
      id: z.string().min(1),
      name: z.string().min(1),
      subtask: z.boolean().default(false),
    }),
  ),
  total: z.number().int().nonnegative(),
});

const changelogPageSchema = z.object({
  maxResults: z.number().int().positive(),
  startAt: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  values: z.array(
    z.object({
      author: jiraUserSchema.optional(),
      created: z.string().min(1),
      id: z.string().min(1),
      items: z.array(
        z.object({
          field: z.string().min(1),
          fromString: z.string().nullable().optional(),
          toString: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
});

const transitionsSchema = z.object({
  transitions: z.array(
    z.object({
      hasScreen: z.boolean().default(false),
      id: z.string().min(1),
      name: z.string().min(1),
      to: z.object({ id: z.string().min(1), name: z.string().min(1) }),
    }),
  ),
});

const worklogPageSchema = z.object({
  maxResults: z.number().int().positive(),
  startAt: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  worklogs: z.array(
    z.object({
      author: jiraUserSchema,
      comment: z.unknown().nullable().optional(),
      created: z.string().min(1),
      id: z.string().min(1),
      started: z.string().min(1),
      timeSpent: z.string().min(1),
      timeSpentSeconds: z.number().int().nonnegative(),
      updated: z.string().min(1),
    }),
  ),
});

const createdIssueSchema = z.object({ id: z.string(), key: z.string() });

const webhookRegistrationResponseSchema = z.object({
  webhookRegistrationResult: z.array(
    z.object({
      createdWebhookId: z.number().optional(),
      errors: z.array(z.string()).optional(),
    }),
  ),
});

const registeredWebhooksSchema = z.object({
  values: z.array(
    z.object({
      id: z.number(),
      url: z.url(),
    }),
  ),
});

function callbackFamily(value: string): string | null {
  try {
    const url = new URL(value);
    const finalSeparator = url.pathname.lastIndexOf("/");

    if (finalSeparator < 0) {
      return null;
    }

    return `${url.origin}${url.pathname.slice(0, finalSeparator + 1)}`;
  } catch {
    return null;
  }
}

function webhookIds(registrationId: string): number[] {
  return registrationId.split(",").flatMap((value) => {
    const id = Number.parseInt(value.trim(), 10);

    return Number.isNaN(id) ? [] : [id];
  });
}

export type { JiraAttachmentContent, JiraTextValue } from "./content";

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
  attachments: readonly AttachmentMetadata[];
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

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  url: string;
}
export interface JiraIssueType {
  description: string;
  id: string;
  name: string;
  subtask: boolean;
}
export interface JiraChangelogPage {
  histories: readonly {
    author: string | null;
    createdAt: string;
    id: string;
    items: readonly { field: string; from: string | null; to: string | null }[];
  }[];
  nextStartAt: number | null;
  total: number;
}
export interface JiraTransition {
  hasScreen: boolean;
  id: string;
  name: string;
  to: { id: string; name: string };
}
export interface JiraWorklogPage {
  nextStartAt: number | null;
  total: number;
  worklogs: readonly {
    author: string;
    comment: JiraTextValue;
    createdAt: string;
    id: string;
    startedAt: string;
    timeSpent: string;
    timeSpentSeconds: number;
    updatedAt: string;
  }[];
}
export interface JiraCreateIssueInput {
  description?: string;
  issueTypeId: string;
  labels?: readonly string[];
  parentIssueKey?: string;
  projectId: string;
  summary: string;
}

export interface JiraAdapter extends IntegrationAdapter {
  addComment(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
    body: string,
  ): Promise<JiraComment | null>;
  createIssue(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    input: JiraCreateIssueInput,
  ): Promise<JiraIssue>;
  getCreateMetadata(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    projectId: string,
  ): Promise<readonly JiraIssueType[]>;
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
  getIssueAttachment(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
    attachmentId: string,
  ): Promise<JiraAttachmentContent | null>;
  getIssueChangelog(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
    startAt: number,
    limit: number,
  ): Promise<JiraChangelogPage | null>;
  getIssueTransitions(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
  ): Promise<readonly JiraTransition[] | null>;
  getIssueWorklogs(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
    startAt: number,
    limit: number,
  ): Promise<JiraWorklogPage | null>;
  listAllowedProjects(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
  ): Promise<readonly JiraProject[]>;
  listIssueAttachments(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
  ): Promise<{
    attachments: readonly AttachmentMetadata[];
    issue: JiraIssueSummary;
    total: number;
    truncated: boolean;
  } | null>;
  searchIssues(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    input: JiraIssueSearchInput,
  ): Promise<JiraSearchResult>;
  transitionIssue(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
    transitionId: string,
  ): Promise<JiraIssue | null>;
}

function toIsoDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ProviderAdapterError("invalid_response");
  }

  return date.toISOString();
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
    attachments: value.fields.attachment.map(toAttachmentMetadata),
    components: value.fields.components.map((component) => ({ ...component })),
    createdAt: toIsoDate(value.fields.created),
    description: adfToTextValue(
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

function toAttachmentMetadata(
  value: z.infer<typeof attachmentSchema>,
): AttachmentMetadata {
  return {
    author: value.author?.displayName ?? null,
    createdAt: toIsoDate(value.created),
    filename: value.filename,
    id: value.id,
    mimeType: value.mimeType,
    size: value.size,
  };
}

export function createJiraAdapter(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): JiraAdapter {
  const oauth = createJiraOAuthClient(config);

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
        externalKey: project.key,
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
        fields: issueFields,
        jql,
        maxResults: limit,
      }),
    );

    if (!parsed.success) {
      throw new ProviderAdapterError("invalid_response");
    }

    return parsed.data.issues;
  }

  function apiUrl(resource: ProviderResource, path: string): string {
    return `https://api.atlassian.com/ex/jira/${encodeURIComponent(resource.externalId)}/rest/api/3/${path}`;
  }

  async function findIssue(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
  ) {
    const issues = await search(
      credentials,
      resource,
      buildJql(allowedProjectIds, { issueKey }),
      1,
    );
    return issues[0] ?? null;
  }

  async function getIssueDirect(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    issueKey: string,
  ) {
    const url = new URL(
      apiUrl(resource, `issue/${encodeURIComponent(issueKey)}`),
    );
    url.searchParams.set("fields", issueFields.join(","));
    const parsed = jiraIssueSchema.safeParse(
      await oauth.getJson(url.toString(), credentials.accessToken),
    );
    if (!parsed.success) throw new ProviderAdapterError("invalid_response");
    if (!allowedProjectIds.includes(parsed.data.fields.project.id)) {
      throw new ProviderAdapterError("inaccessible_resource");
    }
    return parsed.data;
  }

  async function issueTypes(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedProjectIds: readonly string[],
    projectId: string,
  ): Promise<readonly JiraIssueType[]> {
    if (!allowedProjectIds.includes(projectId)) {
      throw new ProviderAdapterError("inaccessible_resource");
    }
    const types: JiraIssueType[] = [];
    let startAt = 0;
    for (let page = 0; page < 4; page += 1) {
      const url = new URL(
        apiUrl(
          resource,
          `issue/createmeta/${encodeURIComponent(projectId)}/issuetypes`,
        ),
      );
      url.searchParams.set("maxResults", "50");
      url.searchParams.set("startAt", String(startAt));
      const parsed = createMetadataSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      types.push(...parsed.data.issueTypes.map((type) => ({ ...type })));
      startAt += parsed.data.issueTypes.length;
      if (startAt >= parsed.data.total || parsed.data.issueTypes.length === 0)
        break;
    }
    return types.slice(0, 200);
  }

  const adapter: JiraAdapter = {
    async addComment(credentials, resource, allowedProjectIds, issueKey, body) {
      const issue = await findIssue(
        credentials,
        resource,
        allowedProjectIds,
        issueKey,
      );
      if (issue === null) return null;
      const parsed = z
        .object({
          author: jiraUserSchema,
          body: z.unknown(),
          created: z.string(),
          id: z.string(),
          updated: z.string(),
          visibility: z
            .object({ value: z.string().optional() })
            .nullable()
            .optional(),
        })
        .safeParse(
          await oauth.postJson(
            apiUrl(resource, `issue/${encodeURIComponent(issue.key)}/comment`),
            credentials.accessToken,
            { body: textToAdf(body) },
          ),
        );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      return {
        author: parsed.data.author.displayName,
        body: adfToTextValue(parsed.data.body, maximumCommentCharacters),
        createdAt: toIsoDate(parsed.data.created),
        id: parsed.data.id,
        updatedAt: toIsoDate(parsed.data.updated),
        visibility: parsed.data.visibility?.value ?? null,
      };
    },
    async registerWebhooks(credentials, resource, callbackUrl, selectedScopes) {
      const webhookUrl = apiUrl(resource, "webhook");
      const registered = registeredWebhooksSchema.safeParse(
        await oauth.getJson(webhookUrl, credentials.accessToken),
      );

      if (!registered.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      // Jira can retain a valid dynamic webhook after Context Layer has lost
      // its registration id (for example after replacing an installation).
      // Reconcile callbacks owned by this deployment before registering the
      // desired set, otherwise Jira rejects the duplicate event/JQL pair and
      // keeps delivering to a token the application no longer recognises.
      const expectedFamily = callbackFamily(callbackUrl);
      const staleIds = registered.data.values
        .filter((webhook) => callbackFamily(webhook.url) === expectedFamily)
        .map((webhook) => webhook.id);

      if (staleIds.length > 0) {
        await oauth.deleteWithoutResponse(webhookUrl, credentials.accessToken, {
          webhookIds: staleIds,
        });
      }

      const projectKeys = selectedScopes
        .filter((scope) => scope.scopeKey === jiraProjectScopeKey)
        .map((scope) => scope.externalKey)
        .filter((key) => key !== null);

      if (projectKeys.length === 0) {
        return null;
      }

      const jqlFilter =
        projectKeys.length === 1
          ? `project = ${projectKeys.join("")}`
          : `project IN (${projectKeys.join(", ")})`;
      const requestedWebhooks = [
        {
          events: ["jira:issue_updated", "jira:issue_created"],
          jqlFilter,
        },
        { events: ["comment_created"], jqlFilter },
      ];
      const response = await oauth.postJson(
        webhookUrl,
        credentials.accessToken,
        {
          url: callbackUrl,
          webhooks: requestedWebhooks,
        },
      );
      const parsed = webhookRegistrationResponseSchema.safeParse(response);

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      const createdIds = parsed.data.webhookRegistrationResult
        .map((result) => result.createdWebhookId)
        .filter((id) => id !== undefined);

      if (
        createdIds.length !== requestedWebhooks.length ||
        parsed.data.webhookRegistrationResult.some(
          (result) => result.errors !== undefined && result.errors.length > 0,
        )
      ) {
        // Jira reports one result per requested webhook and can partially
        // succeed. Remove anything it did create so the next attempt starts
        // from a known state, but never expose Jira's raw error text.
        if (createdIds.length > 0) {
          try {
            await oauth.deleteWithoutResponse(
              webhookUrl,
              credentials.accessToken,
              { webhookIds: createdIds },
            );
          } catch {
            // The registration failure remains the actionable error. A later
            // reconciliation will remove any partial callback left behind.
          }
        }

        throw new ProviderAdapterError("invalid_request");
      }

      return createdIds.map((id) => id.toString()).join(",");
    },
    async unregisterWebhooks(credentials, resource, registrationId) {
      // registerWebhooks stores the created ids comma-joined.
      const registeredIds = webhookIds(registrationId);

      if (registeredIds.length === 0) {
        return;
      }

      await oauth.deleteWithoutResponse(
        apiUrl(resource, "webhook"),
        credentials.accessToken,
        { webhookIds: registeredIds },
      );
    },
    buildAuthorizationUrl: (state) => oauth.buildAuthorizationUrl(state),
    async createIssue(credentials, resource, allowedProjectIds, input) {
      const types = await issueTypes(
        credentials,
        resource,
        allowedProjectIds,
        input.projectId,
      );
      if (!types.some((type) => type.id === input.issueTypeId)) {
        throw new ProviderAdapterError("invalid_request");
      }
      if (input.parentIssueKey !== undefined) {
        const parent = await findIssue(
          credentials,
          resource,
          allowedProjectIds,
          input.parentIssueKey,
        );
        if (parent?.fields.project.id !== input.projectId) {
          throw new ProviderAdapterError("inaccessible_resource");
        }
      }
      const fields = {
        ...(input.description === undefined
          ? {}
          : { description: textToAdf(input.description) }),
        ...(input.labels === undefined ? {} : { labels: input.labels }),
        ...(input.parentIssueKey === undefined
          ? {}
          : { parent: { key: input.parentIssueKey } }),
        issuetype: { id: input.issueTypeId },
        project: { id: input.projectId },
        summary: input.summary,
      };
      const created = createdIssueSchema.safeParse(
        await oauth.postJson(
          apiUrl(resource, "issue"),
          credentials.accessToken,
          { fields },
        ),
      );
      if (!created.success) throw new ProviderAdapterError("invalid_response");
      const issue = await getIssueDirect(
        credentials,
        resource,
        allowedProjectIds,
        created.data.key,
      );
      return toIssue(issue, resource);
    },
    discoverResources: (credentials) => oauth.discoverResources(credentials),
    async discoverScopes(credentials, resource, query, cursor) {
      const startAt = cursor === null ? 0 : Number.parseInt(cursor, 10);

      if (!Number.isSafeInteger(startAt) || startAt < 0) {
        throw new ProviderAdapterError("invalid_response");
      }

      return discoverProjects(credentials, resource, query, startAt);
    },
    exchangeAuthorizationCode: (code) => oauth.exchangeAuthorizationCode(code),
    getCreateMetadata: issueTypes,
    async getIssue(credentials, resource, allowedProjectIds, issueKey) {
      const issue = await findIssue(
        credentials,
        resource,
        allowedProjectIds,
        issueKey,
      );
      return issue === null ? null : toIssue(issue, resource);
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
          body: adfToTextValue(comment.body, maximumCommentCharacters),
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
    async getIssueAttachment(
      credentials,
      resource,
      allowedProjectIds,
      issueKey,
      attachmentId,
    ) {
      const issue = await findIssue(
        credentials,
        resource,
        allowedProjectIds,
        issueKey,
      );
      if (issue === null) return null;
      const attachment = issue.fields.attachment.find(
        (item) => item.id === attachmentId,
      );
      if (attachment === undefined) return null;
      if (attachment.size > maximumAttachmentBytes) {
        throw new ProviderAdapterError("content_too_large");
      }
      const url = new URL(
        apiUrl(
          resource,
          `attachment/content/${encodeURIComponent(attachmentId)}`,
        ),
      );
      url.searchParams.set("redirect", "false");
      const downloaded = await oauth.getBytes(
        url.toString(),
        credentials.accessToken,
        maximumAttachmentBytes,
      );
      return extractAttachment(
        toAttachmentMetadata(attachment),
        downloaded.bytes,
        downloaded.contentType,
      );
    },
    async getIssueChangelog(
      credentials,
      resource,
      allowedProjectIds,
      issueKey,
      startAt,
      limit,
    ) {
      const issue = await findIssue(
        credentials,
        resource,
        allowedProjectIds,
        issueKey,
      );
      if (issue === null) return null;
      const url = new URL(
        apiUrl(resource, `issue/${encodeURIComponent(issue.key)}/changelog`),
      );
      url.searchParams.set("startAt", String(startAt));
      url.searchParams.set("maxResults", String(limit));
      const parsed = changelogPageSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      const next = parsed.data.startAt + parsed.data.values.length;
      return {
        histories: parsed.data.values.map((history) => ({
          author: history.author?.displayName ?? null,
          createdAt: toIsoDate(history.created),
          id: history.id,
          items: history.items.slice(0, 50).map((item) => ({
            field: item.field,
            from: item.fromString?.slice(0, 2_000) ?? null,
            to: item.toString?.slice(0, 2_000) ?? null,
          })),
        })),
        nextStartAt: next < parsed.data.total ? next : null,
        total: parsed.data.total,
      };
    },
    async getIssueTransitions(
      credentials,
      resource,
      allowedProjectIds,
      issueKey,
    ) {
      const issue = await findIssue(
        credentials,
        resource,
        allowedProjectIds,
        issueKey,
      );
      if (issue === null) return null;
      const parsed = transitionsSchema.safeParse(
        await oauth.getJson(
          apiUrl(
            resource,
            `issue/${encodeURIComponent(issue.key)}/transitions`,
          ),
          credentials.accessToken,
        ),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      return parsed.data.transitions
        .slice(0, 100)
        .map((transition) => ({ ...transition }));
    },
    async getIssueWorklogs(
      credentials,
      resource,
      allowedProjectIds,
      issueKey,
      startAt,
      limit,
    ) {
      const issue = await findIssue(
        credentials,
        resource,
        allowedProjectIds,
        issueKey,
      );
      if (issue === null) return null;
      const url = new URL(
        apiUrl(resource, `issue/${encodeURIComponent(issue.key)}/worklog`),
      );
      url.searchParams.set("startAt", String(startAt));
      url.searchParams.set("maxResults", String(limit));
      const parsed = worklogPageSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      const next = parsed.data.startAt + parsed.data.worklogs.length;
      return {
        nextStartAt: next < parsed.data.total ? next : null,
        total: parsed.data.total,
        worklogs: parsed.data.worklogs.map((worklog) => ({
          author: worklog.author.displayName,
          comment: adfToTextValue(worklog.comment, maximumCommentCharacters),
          createdAt: toIsoDate(worklog.created),
          id: worklog.id,
          startedAt: toIsoDate(worklog.started),
          timeSpent: worklog.timeSpent,
          timeSpentSeconds: worklog.timeSpentSeconds,
          updatedAt: toIsoDate(worklog.updated),
        })),
      };
    },
    getIdentity: (credentials) => oauth.getIdentity(credentials),
    async listAllowedProjects(credentials, resource, allowedProjectIds) {
      const allowed = new Set(allowedProjectIds);
      const projects: JiraProject[] = [];
      let startAt = 0;
      let pages = 0;
      while (pages < 40 && projects.length < allowed.size) {
        const page = await discoverProjects(credentials, resource, "", startAt);
        for (const item of page.items) {
          if (!allowed.has(item.externalId)) continue;
          const match = /^(.*) \(([^()]+)\)$/.exec(item.displayName);
          projects.push({
            id: item.externalId,
            key: match?.[2] ?? item.externalId,
            name: match?.[1] ?? item.displayName,
            url: `${resource.url.replace(/\/$/, "")}/browse/${encodeURIComponent(match?.[2] ?? item.externalId)}`,
          });
        }
        if (page.nextCursor === null) break;
        startAt = Number.parseInt(page.nextCursor, 10);
        pages += 1;
      }
      return projects;
    },
    async listIssueAttachments(
      credentials,
      resource,
      allowedProjectIds,
      issueKey,
    ) {
      const issue = await findIssue(
        credentials,
        resource,
        allowedProjectIds,
        issueKey,
      );
      if (issue === null) return null;
      const all = issue.fields.attachment.map(toAttachmentMetadata);
      return {
        attachments: all.slice(0, 100),
        issue: toIssueSummary(issue, resource),
        total: all.length,
        truncated: all.length > 100,
      };
    },
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
    async transitionIssue(
      credentials,
      resource,
      allowedProjectIds,
      issueKey,
      transitionId,
    ) {
      const issue = await findIssue(
        credentials,
        resource,
        allowedProjectIds,
        issueKey,
      );
      if (issue === null) return null;
      const transitions = await adapter.getIssueTransitions(
        credentials,
        resource,
        allowedProjectIds,
        issue.key,
      );
      if (!transitions?.some((item) => item.id === transitionId)) {
        throw new ProviderAdapterError("invalid_request");
      }
      await oauth.postWithoutResponse(
        apiUrl(resource, `issue/${encodeURIComponent(issue.key)}/transitions`),
        credentials.accessToken,
        { transition: { id: transitionId } },
      );
      const refreshed = await getIssueDirect(
        credentials,
        resource,
        allowedProjectIds,
        issue.key,
      );
      return toIssue(refreshed, resource);
    },
  };

  return adapter;
}
