import { z } from "zod";

import {
  ProviderAdapterError,
  type IntegrationAdapter,
  type OAuthCredentials,
  type ProviderResource,
} from "../integration-adapter";
import { githubProvider, githubRepositoryScope } from "./definition";
import { createGitHubOAuthClient } from "./oauth-client";

const maximumFileCharacters = 50_000;
const maximumChangeBytes = 1_048_576;
const maximumChanges = 20;

const userSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  name: z.string().nullable().optional(),
});
const installationSchema = z.object({
  account: z.object({
    html_url: z.url(),
    login: z.string().min(1),
  }),
  html_url: z.url().optional(),
  id: z.number().int().positive(),
});
const installationsSchema = z.object({
  installations: z.array(installationSchema),
  total_count: z.number().int().nonnegative(),
});
const repositorySchema = z.object({
  archived: z.boolean().default(false),
  default_branch: z.string().min(1),
  description: z.string().nullable().default(null),
  full_name: z.string().min(3),
  html_url: z.url(),
  id: z.number().int().positive(),
  name: z.string().min(1),
  private: z.boolean(),
});
const repositoriesSchema = z.object({
  repositories: z.array(repositorySchema),
  total_count: z.number().int().nonnegative(),
});
const fileSchema = z.object({
  content: z.string(),
  encoding: z.literal("base64"),
  html_url: z.url().nullable().optional(),
  name: z.string().min(1),
  path: z.string().min(1),
  sha: z.string().min(1),
  size: z.number().int().nonnegative(),
  type: z.literal("file"),
});
const searchSchema = z.object({
  incomplete_results: z.boolean(),
  items: z.array(
    z.object({
      html_url: z.url(),
      name: z.string().min(1),
      path: z.string().min(1),
      repository: z.object({ id: z.number().int().positive() }),
      sha: z.string().min(1),
      text_matches: z
        .array(z.object({ fragment: z.string().default("") }))
        .optional(),
    }),
  ),
  total_count: z.number().int().nonnegative(),
});
const branchSchema = z.object({
  commit: z.object({ sha: z.string().min(1) }),
  name: z.string().min(1),
  protected: z.boolean().default(false),
});
const commitSchema = z.object({
  author: z
    .object({ login: z.string().min(1) })
    .nullable()
    .optional(),
  commit: z.object({
    author: z
      .object({ date: z.string().nullable(), name: z.string().min(1) })
      .nullable(),
    message: z.string(),
  }),
  html_url: z.url(),
  sha: z.string().min(1),
});
const labelSchema = z.union([
  z.string(),
  z.object({ name: z.string().nullable().optional() }),
]);
const issueSchema = z.object({
  body: z.string().nullable().default(null),
  closed_at: z.string().nullable().default(null),
  created_at: z.string(),
  html_url: z.url(),
  labels: z.array(labelSchema).default([]),
  number: z.number().int().positive(),
  pull_request: z.unknown().optional(),
  state: z.string(),
  title: z.string(),
  updated_at: z.string(),
  user: z.object({ login: z.string().min(1) }).nullable(),
});
const commentSchema = z.object({
  body: z.string(),
  created_at: z.string(),
  html_url: z.url(),
  id: z.number().int().positive(),
  updated_at: z.string(),
  user: z.object({ login: z.string().min(1) }).nullable(),
});
const pullRequestSchema = z.object({
  base: z.object({ ref: z.string(), sha: z.string() }),
  body: z.string().nullable().default(null),
  closed_at: z.string().nullable().default(null),
  created_at: z.string(),
  draft: z.boolean().default(false),
  head: z.object({ ref: z.string(), sha: z.string() }),
  html_url: z.url(),
  mergeable: z.boolean().nullable().optional(),
  merged: z.boolean().default(false),
  number: z.number().int().positive(),
  state: z.string(),
  title: z.string(),
  updated_at: z.string(),
  user: z.object({ login: z.string().min(1) }).nullable(),
});
const pullRequestFileSchema = z.object({
  additions: z.number().int().nonnegative(),
  changes: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  filename: z.string().min(1),
  previous_filename: z.string().optional(),
  sha: z.string().min(1),
  status: z.string(),
});
const referenceSchema = z.object({
  object: z.object({ sha: z.string().min(1) }),
  ref: z.string().min(1),
});
const gitCommitSchema = z.object({
  sha: z.string().min(1),
  tree: z.object({ sha: z.string().min(1) }),
});
const treeSchema = z.object({
  sha: z.string().min(1),
  tree: z.array(
    z.object({
      mode: z.string(),
      path: z.string(),
      sha: z.string().nullable(),
      type: z.string(),
    }),
  ),
  truncated: z.boolean().default(false),
});
const shaSchema = z.object({ sha: z.string().min(1) });

export interface GitHubRepository {
  archived: boolean;
  defaultBranch: string;
  description: string | null;
  fullName: string;
  id: string;
  name: string;
  private: boolean;
  url: string;
}
export interface GitHubPage<T> {
  items: readonly T[];
  nextCursor: string | null;
}
export interface GitHubFile {
  content: string;
  name: string;
  path: string;
  sha: string;
  size: number;
  truncated: boolean;
  url: string | null;
}
export interface GitHubCodeResult {
  fragments: readonly string[];
  name: string;
  path: string;
  sha: string;
  url: string;
}
export interface GitHubBranch {
  name: string;
  protected: boolean;
  sha: string;
}
export interface GitHubCommit {
  authoredAt: string | null;
  author: string | null;
  message: string;
  sha: string;
  url: string;
}
export interface GitHubIssue {
  author: string | null;
  body: string | null;
  closedAt: string | null;
  createdAt: string;
  labels: readonly string[];
  number: number;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
}
export interface GitHubComment {
  author: string | null;
  body: string;
  createdAt: string;
  id: string;
  updatedAt: string;
  url: string;
}
export interface GitHubPullRequest {
  author: string | null;
  baseBranch: string;
  baseSha: string;
  body: string | null;
  closedAt: string | null;
  createdAt: string;
  draft: boolean;
  headBranch: string;
  headSha: string;
  mergeable: boolean | null;
  merged: boolean;
  number: number;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
}
export interface GitHubPullRequestFile {
  additions: number;
  changes: number;
  deletions: number;
  path: string;
  previousPath: string | null;
  sha: string;
  status: string;
}
export type GitHubFileChange =
  | { content: string; operation: "upsert"; path: string }
  | { operation: "delete"; path: string };
export interface GitHubPullRequestInput {
  baseBranch: string;
  body?: string;
  draft: boolean;
  headBranch: string;
  title: string;
}
export interface GitHubPullRequestWithChangesInput {
  baseBranch: string;
  body?: string;
  changes: readonly GitHubFileChange[];
  commitMessage: string;
  draft: boolean;
  newBranch: string;
  title: string;
}

export interface GitHubAdapter extends IntegrationAdapter {
  addComment(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    number: number,
    body: string,
  ): Promise<GitHubComment>;
  createIssue(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    input: {
      assignees?: readonly string[];
      body?: string;
      labels?: readonly string[];
      title: string;
    },
  ): Promise<GitHubIssue>;
  createPullRequest(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    input: GitHubPullRequestInput,
  ): Promise<GitHubPullRequest>;
  createPullRequestWithChanges(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    input: GitHubPullRequestWithChangesInput,
  ): Promise<{
    branch: string;
    commitSha: string;
    pullRequest: GitHubPullRequest;
  }>;
  getCommit(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    sha: string,
  ): Promise<GitHubCommit>;
  getFile(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    path: string,
    ref?: string,
  ): Promise<GitHubFile>;
  getIssue(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    number: number,
  ): Promise<GitHubIssue | null>;
  getPullRequest(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    number: number,
  ): Promise<GitHubPullRequest>;
  getRepository(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
  ): Promise<GitHubRepository>;
  listAllowedRepositories(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
  ): Promise<readonly GitHubRepository[]>;
  listBranches(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    cursor: string | null,
    limit: number,
  ): Promise<GitHubPage<GitHubBranch>>;
  listCommits(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    cursor: string | null,
    limit: number,
    ref?: string,
  ): Promise<GitHubPage<GitHubCommit>>;
  listIssueComments(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    number: number,
    cursor: string | null,
    limit: number,
  ): Promise<GitHubPage<GitHubComment>>;
  listIssues(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    cursor: string | null,
    limit: number,
    state: "all" | "closed" | "open",
  ): Promise<GitHubPage<GitHubIssue>>;
  listPullRequestFiles(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    number: number,
    cursor: string | null,
    limit: number,
  ): Promise<GitHubPage<GitHubPullRequestFile>>;
  listPullRequests(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    cursor: string | null,
    limit: number,
    state: "all" | "closed" | "open",
  ): Promise<GitHubPage<GitHubPullRequest>>;
  searchCode(
    credentials: OAuthCredentials,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    query: string,
    cursor: string | null,
    limit: number,
  ): Promise<
    GitHubPage<GitHubCodeResult> & { incomplete: boolean; total: number }
  >;
}

function repository(value: z.infer<typeof repositorySchema>): GitHubRepository {
  return {
    archived: value.archived,
    defaultBranch: value.default_branch,
    description: value.description,
    fullName: value.full_name,
    id: String(value.id),
    name: value.name,
    private: value.private,
    url: value.html_url,
  };
}
function issue(value: z.infer<typeof issueSchema>): GitHubIssue {
  return {
    author: value.user?.login ?? null,
    body: value.body?.slice(0, 50_000) ?? null,
    closedAt: value.closed_at,
    createdAt: value.created_at,
    labels: value.labels.flatMap((label) =>
      typeof label === "string"
        ? [label]
        : label.name === null || label.name === undefined
          ? []
          : [label.name],
    ),
    number: value.number,
    state: value.state,
    title: value.title,
    updatedAt: value.updated_at,
    url: value.html_url,
  };
}
function comment(value: z.infer<typeof commentSchema>): GitHubComment {
  return {
    author: value.user?.login ?? null,
    body: value.body.slice(0, 50_000),
    createdAt: value.created_at,
    id: String(value.id),
    updatedAt: value.updated_at,
    url: value.html_url,
  };
}
function pullRequest(
  value: z.infer<typeof pullRequestSchema>,
): GitHubPullRequest {
  return {
    author: value.user?.login ?? null,
    baseBranch: value.base.ref,
    baseSha: value.base.sha,
    body: value.body?.slice(0, 50_000) ?? null,
    closedAt: value.closed_at,
    createdAt: value.created_at,
    draft: value.draft,
    headBranch: value.head.ref,
    headSha: value.head.sha,
    mergeable: value.mergeable ?? null,
    merged: value.merged,
    number: value.number,
    state: value.state,
    title: value.title,
    updatedAt: value.updated_at,
    url: value.html_url,
  };
}
function commit(value: z.infer<typeof commitSchema>): GitHubCommit {
  return {
    authoredAt: value.commit.author?.date ?? null,
    author: value.author?.login ?? value.commit.author?.name ?? null,
    message: value.commit.message.slice(0, 10_000),
    sha: value.sha,
    url: value.html_url,
  };
}
function pageNumber(cursor: string | null): number {
  if (cursor === null) return 1;
  const page = Number(cursor);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    throw new ProviderAdapterError("invalid_request");
  }
  return page;
}
function nextPage(
  page: number,
  returned: number,
  limit: number,
): string | null {
  return returned === limit ? String(page + 1) : null;
}
function endpoint(fullName: string, suffix = ""): string {
  const [owner, name, extra] = fullName.split("/");
  if (owner === undefined || name === undefined || extra !== undefined) {
    throw new ProviderAdapterError("invalid_response");
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`;
}
function branchPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}
function hasControlCharacter(value: string, includeSpace: boolean): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < (includeSpace ? 33 : 32) || code === 127) return true;
  }
  return false;
}
function validateChangePath(path: string): void {
  if (
    path.length === 0 ||
    path.length > 1_024 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    hasControlCharacter(path, false) ||
    path
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") ||
    path === ".github/workflows" ||
    path.startsWith(".github/workflows/")
  ) {
    throw new ProviderAdapterError("invalid_request");
  }
}

function validateBranchName(branch: string): void {
  if (
    branch.length === 0 ||
    branch.length > 255 ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    hasControlCharacter(branch, true) ||
    /[~^:?*[\\]/.test(branch)
  ) {
    throw new ProviderAdapterError("invalid_request");
  }
}

export function createGitHubAdapter(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  slug: string;
}): GitHubAdapter {
  const oauth = createGitHubOAuthClient(config);

  async function parsed<T>(
    credentials: OAuthCredentials,
    path: string,
    schema: z.ZodType<T>,
    init?: { body?: unknown; method?: "DELETE" | "GET" | "PATCH" | "POST" },
  ): Promise<T> {
    const result = schema.safeParse(
      await oauth.request(path, credentials.accessToken, init),
    );
    if (!result.success) throw new ProviderAdapterError("invalid_response");
    return result.data;
  }
  async function resolveRepository(
    credentials: OAuthCredentials,
    allowedIds: readonly string[],
    repositoryId: string,
  ) {
    if (!allowedIds.includes(repositoryId) || !/^\d+$/.test(repositoryId)) {
      throw new ProviderAdapterError("inaccessible_resource");
    }
    return parsed(
      credentials,
      `/repositories/${repositoryId}`,
      repositorySchema,
    );
  }
  async function installationRepositories(
    credentials: OAuthCredentials,
    installationId: string,
    page: number,
    perPage: number,
  ) {
    if (!/^\d+$/.test(installationId))
      throw new ProviderAdapterError("inaccessible_resource");
    return parsed(
      credentials,
      `/user/installations/${installationId}/repositories?per_page=${String(perPage)}&page=${String(page)}`,
      repositoriesSchema,
    );
  }
  async function allInstallationRepositories(
    credentials: OAuthCredentials,
    resource: ProviderResource,
  ) {
    const repositories: z.infer<typeof repositorySchema>[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const result = await installationRepositories(
        credentials,
        resource.externalId,
        page,
        100,
      );
      repositories.push(...result.repositories);
      if (
        result.repositories.length < 100 ||
        repositories.length >= result.total_count
      )
        break;
    }
    return repositories;
  }
  async function createPr(
    credentials: OAuthCredentials,
    repo: z.infer<typeof repositorySchema>,
    input: GitHubPullRequestInput,
  ) {
    return pullRequest(
      await parsed(
        credentials,
        endpoint(repo.full_name, "/pulls"),
        pullRequestSchema,
        {
          body: {
            base: input.baseBranch,
            ...(input.body === undefined ? {} : { body: input.body }),
            draft: input.draft,
            head: input.headBranch,
            title: input.title,
          },
          method: "POST",
        },
      ),
    );
  }

  return {
    async addComment(credentials, allowedIds, repositoryId, number, body) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      return comment(
        await parsed(
          credentials,
          endpoint(repo.full_name, `/issues/${String(number)}/comments`),
          commentSchema,
          { body: { body }, method: "POST" },
        ),
      );
    },
    buildAuthorizationUrl: (state) => oauth.buildAuthorizationUrl(state),
    buildInstallationAuthorizationUrl: (state) =>
      oauth.buildInstallationAuthorizationUrl(state),
    async createIssue(credentials, allowedIds, repositoryId, input) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      return issue(
        await parsed(
          credentials,
          endpoint(repo.full_name, "/issues"),
          issueSchema,
          { body: input, method: "POST" },
        ),
      );
    },
    async createPullRequest(credentials, allowedIds, repositoryId, input) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      validateBranchName(input.baseBranch);
      validateBranchName(input.headBranch);
      if (input.baseBranch === input.headBranch)
        throw new ProviderAdapterError("invalid_request");
      return createPr(credentials, repo, input);
    },
    async createPullRequestWithChanges(
      credentials,
      allowedIds,
      repositoryId,
      input,
    ) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      validateBranchName(input.baseBranch);
      validateBranchName(input.newBranch);
      if (
        input.changes.length < 1 ||
        input.changes.length > maximumChanges ||
        input.baseBranch === input.newBranch ||
        input.newBranch === repo.default_branch
      ) {
        throw new ProviderAdapterError("invalid_request");
      }
      const paths = new Set<string>();
      let totalBytes = 0;
      for (const change of input.changes) {
        validateChangePath(change.path);
        if (paths.has(change.path))
          throw new ProviderAdapterError("invalid_request");
        paths.add(change.path);
        if (change.operation === "upsert") {
          if (change.content.includes("\0")) {
            throw new ProviderAdapterError("unsupported_content");
          }
          totalBytes += Buffer.byteLength(change.content, "utf8");
          if (totalBytes > maximumChangeBytes)
            throw new ProviderAdapterError("content_too_large");
        }
      }
      try {
        await parsed(
          credentials,
          endpoint(
            repo.full_name,
            `/git/ref/heads/${branchPath(input.newBranch)}`,
          ),
          referenceSchema,
        );
        throw new ProviderAdapterError("invalid_request");
      } catch (error) {
        if (
          !(error instanceof ProviderAdapterError) ||
          error.code !== "not_found"
        )
          throw error;
      }
      const baseRef = await parsed(
        credentials,
        endpoint(
          repo.full_name,
          `/git/ref/heads/${branchPath(input.baseBranch)}`,
        ),
        referenceSchema,
      );
      const baseCommit = await parsed(
        credentials,
        endpoint(repo.full_name, `/git/commits/${baseRef.object.sha}`),
        gitCommitSchema,
      );
      const baseTree = await parsed(
        credentials,
        endpoint(
          repo.full_name,
          `/git/trees/${baseCommit.tree.sha}?recursive=1`,
        ),
        treeSchema,
      );
      if (baseTree.truncated)
        throw new ProviderAdapterError("content_too_large");
      const existing = new Map(
        baseTree.tree.map((entry) => [entry.path, entry]),
      );
      const entries: {
        mode: string;
        path: string;
        sha: string | null;
        type: "blob";
      }[] = [];
      for (const change of input.changes) {
        const current = existing.get(change.path);
        if (
          current !== undefined &&
          (current.type !== "blob" ||
            !["100644", "100755"].includes(current.mode))
        ) {
          throw new ProviderAdapterError("unsupported_content");
        }
        if (change.operation === "delete") {
          if (current === undefined)
            throw new ProviderAdapterError("not_found");
          entries.push({
            mode: current.mode,
            path: change.path,
            sha: null,
            type: "blob",
          });
        } else {
          const blob = await parsed(
            credentials,
            endpoint(repo.full_name, "/git/blobs"),
            shaSchema,
            {
              body: { content: change.content, encoding: "utf-8" },
              method: "POST",
            },
          );
          entries.push({
            mode: current?.mode ?? "100644",
            path: change.path,
            sha: blob.sha,
            type: "blob",
          });
        }
      }
      const tree = await parsed(
        credentials,
        endpoint(repo.full_name, "/git/trees"),
        shaSchema,
        {
          body: { base_tree: baseCommit.tree.sha, tree: entries },
          method: "POST",
        },
      );
      const createdCommit = await parsed(
        credentials,
        endpoint(repo.full_name, "/git/commits"),
        shaSchema,
        {
          body: {
            message: input.commitMessage,
            parents: [baseRef.object.sha],
            tree: tree.sha,
          },
          method: "POST",
        },
      );
      await parsed(
        credentials,
        endpoint(repo.full_name, "/git/refs"),
        referenceSchema,
        {
          body: {
            ref: `refs/heads/${input.newBranch}`,
            sha: createdCommit.sha,
          },
          method: "POST",
        },
      );
      try {
        const created = await createPr(credentials, repo, {
          baseBranch: input.baseBranch,
          ...(input.body === undefined ? {} : { body: input.body }),
          draft: input.draft,
          headBranch: input.newBranch,
          title: input.title,
        });
        return {
          branch: input.newBranch,
          commitSha: createdCommit.sha,
          pullRequest: created,
        };
      } catch (error) {
        const isDefinitiveRejection =
          error instanceof ProviderAdapterError &&
          [
            "authorization_expired",
            "forbidden",
            "invalid_request",
            "not_found",
          ].includes(error.code);
        if (isDefinitiveRejection) {
          try {
            const current = await parsed(
              credentials,
              endpoint(
                repo.full_name,
                `/git/ref/heads/${branchPath(input.newBranch)}`,
              ),
              referenceSchema,
            );
            if (current.object.sha === createdCommit.sha) {
              await oauth.request(
                endpoint(
                  repo.full_name,
                  `/git/refs/heads/${branchPath(input.newBranch)}`,
                ),
                credentials.accessToken,
                { method: "DELETE" },
              );
            }
          } catch {
            // Preserve the original sanitized provider failure.
          }
        }
        throw error;
      }
    },
    async discoverResources(credentials) {
      const items: z.infer<typeof installationSchema>[] = [];
      for (let page = 1; page <= 10; page += 1) {
        const result = await parsed(
          credentials,
          `/user/installations?per_page=100&page=${String(page)}`,
          installationsSchema,
        );
        items.push(...result.installations);
        if (
          result.installations.length < 100 ||
          items.length >= result.total_count
        )
          break;
      }
      return items.map((installation) => ({
        externalId: String(installation.id),
        name: installation.account.login,
        url: installation.html_url ?? installation.account.html_url,
      }));
    },
    async discoverScopes(credentials, resource, query, cursor) {
      const page = pageNumber(cursor);
      const result = await installationRepositories(
        credentials,
        resource.externalId,
        page,
        50,
      );
      const normalized = query.trim().toLocaleLowerCase();
      return {
        items: result.repositories
          .filter(
            (repo) =>
              normalized.length === 0 ||
              repo.full_name.toLocaleLowerCase().includes(normalized),
          )
          .map((repo) => ({
            displayName: repo.full_name,
            externalId: String(repo.id),
            scopeKey: githubRepositoryScope,
          })),
        nextCursor:
          result.repositories.length === 50 && page * 50 < result.total_count
            ? String(page + 1)
            : null,
      };
    },
    exchangeAuthorizationCode: (code) => oauth.exchangeAuthorizationCode(code),
    async getCommit(credentials, allowedIds, repositoryId, sha) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      return commit(
        await parsed(
          credentials,
          endpoint(repo.full_name, `/commits/${encodeURIComponent(sha)}`),
          commitSchema,
        ),
      );
    },
    async getFile(credentials, allowedIds, repositoryId, path, ref) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      const url = new URL(
        `https://api.github.com${endpoint(repo.full_name, `/contents/${path.split("/").map(encodeURIComponent).join("/")}`)}`,
      );
      if (ref !== undefined) url.searchParams.set("ref", ref);
      const value = await parsed(
        credentials,
        `${url.pathname}${url.search}`,
        fileSchema,
      );
      let decoded: string;
      try {
        const bytes = Buffer.from(value.content.replace(/\s/g, ""), "base64");
        decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (decoded.includes("\0")) throw new Error("binary");
      } catch {
        throw new ProviderAdapterError("unsupported_content");
      }
      return {
        content: decoded.slice(0, maximumFileCharacters),
        name: value.name,
        path: value.path,
        sha: value.sha,
        size: value.size,
        truncated: decoded.length > maximumFileCharacters,
        url: value.html_url ?? null,
      };
    },
    getIdentity: async (credentials) => {
      const value = await parsed(credentials, "/user", userSchema);
      const name = value.name?.trim();
      return {
        displayName: name !== undefined && name.length > 0 ? name : value.login,
        externalAccountId: String(value.id),
      };
    },
    async getIssue(credentials, allowedIds, repositoryId, number) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      const value = await parsed(
        credentials,
        endpoint(repo.full_name, `/issues/${String(number)}`),
        issueSchema,
      );
      return value.pull_request === undefined ? issue(value) : null;
    },
    async getPullRequest(credentials, allowedIds, repositoryId, number) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      return pullRequest(
        await parsed(
          credentials,
          endpoint(repo.full_name, `/pulls/${String(number)}`),
          pullRequestSchema,
        ),
      );
    },
    async getRepository(credentials, allowedIds, repositoryId) {
      return repository(
        await resolveRepository(credentials, allowedIds, repositoryId),
      );
    },
    async listAllowedRepositories(credentials, resource, allowedIds) {
      const allowed = new Set(allowedIds);
      return (await allInstallationRepositories(credentials, resource))
        .filter((repo) => allowed.has(String(repo.id)))
        .map(repository);
    },
    async listBranches(credentials, allowedIds, repositoryId, cursor, limit) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      const page = pageNumber(cursor);
      const values = await parsed(
        credentials,
        endpoint(
          repo.full_name,
          `/branches?per_page=${String(limit)}&page=${String(page)}`,
        ),
        z.array(branchSchema),
      );
      return {
        items: values.map((value) => ({
          name: value.name,
          protected: value.protected,
          sha: value.commit.sha,
        })),
        nextCursor: nextPage(page, values.length, limit),
      };
    },
    async listCommits(
      credentials,
      allowedIds,
      repositoryId,
      cursor,
      limit,
      ref,
    ) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      const page = pageNumber(cursor);
      const query = new URLSearchParams({
        page: String(page),
        per_page: String(limit),
      });
      if (ref !== undefined) query.set("sha", ref);
      const values = await parsed(
        credentials,
        endpoint(repo.full_name, `/commits?${query.toString()}`),
        z.array(commitSchema),
      );
      return {
        items: values.map(commit),
        nextCursor: nextPage(page, values.length, limit),
      };
    },
    async listIssueComments(
      credentials,
      allowedIds,
      repositoryId,
      number,
      cursor,
      limit,
    ) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      const page = pageNumber(cursor);
      const values = await parsed(
        credentials,
        endpoint(
          repo.full_name,
          `/issues/${String(number)}/comments?per_page=${String(limit)}&page=${String(page)}`,
        ),
        z.array(commentSchema),
      );
      return {
        items: values.map(comment),
        nextCursor: nextPage(page, values.length, limit),
      };
    },
    async listIssues(
      credentials,
      allowedIds,
      repositoryId,
      cursor,
      limit,
      state,
    ) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      const page = pageNumber(cursor);
      const values = await parsed(
        credentials,
        endpoint(
          repo.full_name,
          `/issues?state=${state}&per_page=${String(limit)}&page=${String(page)}`,
        ),
        z.array(issueSchema),
      );
      const issues = values.filter((value) => value.pull_request === undefined);
      return {
        items: issues.map(issue),
        nextCursor: nextPage(page, values.length, limit),
      };
    },
    async listPullRequestFiles(
      credentials,
      allowedIds,
      repositoryId,
      number,
      cursor,
      limit,
    ) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      const page = pageNumber(cursor);
      const values = await parsed(
        credentials,
        endpoint(
          repo.full_name,
          `/pulls/${String(number)}/files?per_page=${String(limit)}&page=${String(page)}`,
        ),
        z.array(pullRequestFileSchema),
      );
      return {
        items: values.map((value) => ({
          additions: value.additions,
          changes: value.changes,
          deletions: value.deletions,
          path: value.filename,
          previousPath: value.previous_filename ?? null,
          sha: value.sha,
          status: value.status,
        })),
        nextCursor: nextPage(page, values.length, limit),
      };
    },
    async listPullRequests(
      credentials,
      allowedIds,
      repositoryId,
      cursor,
      limit,
      state,
    ) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      const page = pageNumber(cursor);
      const values = await parsed(
        credentials,
        endpoint(
          repo.full_name,
          `/pulls?state=${state}&per_page=${String(limit)}&page=${String(page)}`,
        ),
        z.array(pullRequestSchema),
      );
      return {
        items: values.map(pullRequest),
        nextCursor: nextPage(page, values.length, limit),
      };
    },
    provider: githubProvider,
    refreshCredentials: (currentCredentials) =>
      oauth.refreshCredentials(currentCredentials),
    async resolveScopes(credentials, resource, externalIds) {
      const requested = new Set(externalIds);
      const found = (
        await allInstallationRepositories(credentials, resource)
      ).filter((repo) => requested.has(String(repo.id)));
      if (found.length !== requested.size)
        throw new ProviderAdapterError("inaccessible_resource");
      return found.map((repo) => ({
        displayName: repo.full_name,
        externalId: String(repo.id),
        scopeKey: githubRepositoryScope,
      }));
    },
    async searchCode(
      credentials,
      allowedIds,
      repositoryId,
      query,
      cursor,
      limit,
    ) {
      const repo = await resolveRepository(
        credentials,
        allowedIds,
        repositoryId,
      );
      const page = pageNumber(cursor);
      const parameters = new URLSearchParams({
        page: String(page),
        per_page: String(limit),
        q: `${query} repo:${repo.full_name}`,
      });
      const value = await parsed(
        credentials,
        `/search/code?${parameters.toString()}`,
        searchSchema,
      );
      const items = value.items.filter(
        (item) => String(item.repository.id) === repositoryId,
      );
      return {
        incomplete: value.incomplete_results,
        items: items.map((item) => ({
          fragments: (item.text_matches ?? [])
            .slice(0, 5)
            .map((match) => match.fragment.slice(0, 2_000)),
          name: item.name,
          path: item.path,
          sha: item.sha,
          url: item.html_url,
        })),
        nextCursor:
          page * limit < value.total_count && items.length === limit
            ? String(page + 1)
            : null,
        total: value.total_count,
      };
    },
  };
}
