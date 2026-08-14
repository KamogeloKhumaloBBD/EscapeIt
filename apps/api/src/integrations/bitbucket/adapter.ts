import { parseProviderKey, parseScopeKey } from "@context-layer/db";
import { z } from "zod";

import { createBitbucketOAuthClient } from "./oauth-client";
import {
  ProviderAdapterError,
  type DiscoveredScope,
  type IntegrationAdapter,
  type OAuthCredentials,
  type ProviderResource,
  type ScopeDiscoveryPage,
} from "../integration-adapter";

const bitbucketProviderKey = parseProviderKey("bitbucket");
const bitbucketRepositoryScopeKey = parseScopeKey("bitbucket.repository");
const maximumDiffBytes = 2_000_000;
const maximumDiffCharacters = 20_000;
const maximumFileBytes = 2_000_000;
const maximumFileCharacters = 20_000;
const maximumSnippetCharacters = 1_000;

const repositorySchema = z.object({
  description: z.string().nullable().optional(),
  full_name: z.string().min(1),
  is_private: z.boolean().default(true),
  links: z.object({ html: z.object({ href: z.url() }) }),
  mainbranch: z
    .object({ name: z.string().min(1) })
    .nullable()
    .optional(),
  name: z.string().min(1),
  updated_on: z.string().min(1),
  uuid: z.string().min(1),
});

const repositoryPageSchema = z.object({
  next: z.url().optional(),
  values: z.array(repositorySchema),
});

const commitSchema = z.object({
  author: z.object({
    raw: z.string().min(1),
    user: z.object({ display_name: z.string().min(1) }).optional(),
  }),
  date: z.string().min(1),
  hash: z.string().min(1),
  links: z.object({ html: z.object({ href: z.url() }) }),
  message: z.string().default(""),
});

const commitPageSchema = z.object({
  next: z.url().optional(),
  values: z.array(commitSchema),
});

const pullRequestBranchSchema = z.object({
  branch: z.object({ name: z.string().min(1) }),
});

const pullRequestSchema = z.object({
  author: z.object({ display_name: z.string().min(1) }),
  created_on: z.string().min(1),
  description: z.string().default(""),
  destination: pullRequestBranchSchema,
  id: z.number().int().positive(),
  links: z.object({ html: z.object({ href: z.url() }) }),
  source: pullRequestBranchSchema,
  state: z.string().min(1),
  title: z.string().min(1),
  updated_on: z.string().min(1),
});

const pullRequestPageSchema = z.object({
  next: z.url().optional(),
  values: z.array(pullRequestSchema),
});

const pullRequestCommentSchema = z.object({
  content: z.object({ raw: z.string().default("") }),
  created_on: z.string().min(1),
  deleted: z.boolean().default(false),
  id: z.number().int().positive(),
  user: z.object({ display_name: z.string().min(1) }).optional(),
});

const pullRequestCommentPageSchema = z.object({
  next: z.url().optional(),
  values: z.array(pullRequestCommentSchema),
});

const codeSearchPageSchema = z.object({
  next: z.url().optional(),
  values: z.array(
    z.object({
      content_matches: z
        .array(
          z.object({
            lines: z.array(
              z.object({
                segments: z.array(z.object({ text: z.string() })),
              }),
            ),
          }),
        )
        .default([]),
      file: z.object({
        commit: z.object({
          hash: z.string().min(1),
          repository: z.object({ uuid: z.string().min(1) }),
        }),
        path: z.string().min(1),
      }),
    }),
  ),
});

export interface BitbucketRepository {
  description: string | null;
  fullName: string;
  isPrivate: boolean;
  mainBranch: string | null;
  updatedAt: string;
  url: string;
  uuid: string;
}

export interface BitbucketCommit {
  author: string;
  createdAt: string;
  hash: string;
  message: string;
  url: string;
}

export interface BitbucketCommitDetail extends BitbucketCommit {
  diff: { text: string; truncated: boolean };
}

export interface BitbucketFileContent {
  content: string;
  path: string;
  truncated: boolean;
}

export interface BitbucketCodeMatch {
  commitHash: string;
  path: string;
  repositoryId: string;
  snippet: string;
}

export interface BitbucketPullRequest {
  author: string;
  createdAt: string;
  description: string;
  destinationBranch: string;
  id: number;
  sourceBranch: string;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
}

export interface BitbucketPullRequestComment {
  author: string | null;
  body: string;
  createdAt: string;
  deleted: boolean;
  id: number;
}

export type BitbucketPullRequestState =
  "DECLINED" | "MERGED" | "OPEN" | "SUPERSEDED";

interface BitbucketPage<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export interface BitbucketAdapter extends IntegrationAdapter {
  getCommit(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    commitHash: string,
  ): Promise<BitbucketCommitDetail>;
  getFile(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    path: string,
    ref: string,
  ): Promise<BitbucketFileContent>;
  getPullRequest(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    pullRequestId: number,
  ): Promise<BitbucketPullRequest>;
  getPullRequestDiff(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    pullRequestId: number,
  ): Promise<{ text: string; truncated: boolean }>;
  getRepository(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
  ): Promise<BitbucketRepository>;
  listAllowedRepositories(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
  ): Promise<readonly BitbucketRepository[]>;
  listCommits(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    branch: string | null,
    cursor: string | null,
    limit: number,
  ): Promise<BitbucketPage<BitbucketCommit>>;
  listPullRequestComments(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    pullRequestId: number,
    cursor: string | null,
    limit: number,
  ): Promise<BitbucketPage<BitbucketPullRequestComment>>;
  listPullRequests(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
    repositoryId: string,
    state: BitbucketPullRequestState | null,
    cursor: string | null,
    limit: number,
  ): Promise<BitbucketPage<BitbucketPullRequest>>;
  searchCode(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedRepositoryIds: readonly string[],
    query: string,
    cursor: string | null,
    limit: number,
  ): Promise<BitbucketPage<BitbucketCodeMatch>>;
}

function toIsoDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ProviderAdapterError("invalid_response");
  }

  return date.toISOString();
}

function toRepository(
  value: z.infer<typeof repositorySchema>,
): BitbucketRepository {
  return {
    description: value.description ?? null,
    fullName: value.full_name,
    isPrivate: value.is_private,
    mainBranch: value.mainbranch?.name ?? null,
    updatedAt: toIsoDate(value.updated_on),
    url: value.links.html.href,
    uuid: value.uuid,
  };
}

function toCommit(value: z.infer<typeof commitSchema>): BitbucketCommit {
  return {
    author: value.author.user?.display_name ?? value.author.raw,
    createdAt: toIsoDate(value.date),
    hash: value.hash,
    message: value.message.trim(),
    url: value.links.html.href,
  };
}

function toPullRequest(
  value: z.infer<typeof pullRequestSchema>,
): BitbucketPullRequest {
  return {
    author: value.author.display_name,
    createdAt: toIsoDate(value.created_on),
    description: value.description,
    destinationBranch: value.destination.branch.name,
    id: value.id,
    sourceBranch: value.source.branch.name,
    state: value.state,
    title: value.title,
    updatedAt: toIsoDate(value.updated_on),
    url: value.links.html.href,
  };
}

function boundText(
  text: string,
  maximumCharacters: number,
): { text: string; truncated: boolean } {
  if (text.length <= maximumCharacters) {
    return { text, truncated: false };
  }

  return { text: text.slice(0, maximumCharacters), truncated: true };
}

function repositoryPath(
  resource: ProviderResource,
  allowedRepositoryIds: readonly string[],
  repositoryId: string,
): string {
  if (!allowedRepositoryIds.includes(repositoryId)) {
    throw new ProviderAdapterError("inaccessible_resource");
  }

  // Bitbucket accepts a repository's UUID directly in place of its slug, and
  // the values discovered/stored for the allowlist are already the raw
  // brace-wrapped UUID strings Bitbucket returns (e.g. "{abc-123}"), so no
  // additional wrapping is needed here.
  return `${encodeURIComponent(resource.externalId)}/${encodeURIComponent(repositoryId)}`;
}

function apiUrl(path: string): string {
  return `https://api.bitbucket.org/2.0/${path}`;
}

export function createBitbucketAdapter(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): BitbucketAdapter {
  const oauth = createBitbucketOAuthClient(config);

  async function listRepositoriesPage(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    query: string,
    cursor: string | null,
  ): Promise<BitbucketPage<BitbucketRepository>> {
    let url: string;

    if (cursor !== null) {
      url = cursor;
    } else {
      const initial = new URL(
        apiUrl(`repositories/${encodeURIComponent(resource.externalId)}`),
      );
      initial.searchParams.set("pagelen", "50");
      initial.searchParams.set("sort", "name");

      if (query.length > 0) {
        initial.searchParams.set("q", `name~"${query}"`);
      }

      url = initial.toString();
    }

    const parsed = repositoryPageSchema.safeParse(
      await oauth.getJson(url, credentials.accessToken),
    );

    if (!parsed.success) {
      throw new ProviderAdapterError("invalid_response");
    }

    return {
      items: parsed.data.values.map(toRepository),
      nextCursor: parsed.data.next ?? null,
    };
  }

  async function boundedDiff(
    path: string,
    ref: string,
    credentials: OAuthCredentials,
  ): Promise<{ text: string; truncated: boolean }> {
    const downloaded = await oauth.getBytes(
      apiUrl(`repositories/${path}/diff/${encodeURIComponent(ref)}`),
      credentials.accessToken,
      maximumDiffBytes,
    );
    return boundText(
      new TextDecoder("utf-8", { fatal: false }).decode(downloaded.bytes),
      maximumDiffCharacters,
    );
  }

  const adapter: BitbucketAdapter = {
    buildAuthorizationUrl: (state) => oauth.buildAuthorizationUrl(state),
    discoverResources: (credentials) => oauth.discoverResources(credentials),
    async discoverScopes(credentials, resource, query, cursor) {
      const page = await listRepositoriesPage(
        credentials,
        resource,
        query,
        cursor,
      );
      return {
        items: page.items.map((repository) => ({
          displayName: repository.fullName,
          externalId: repository.uuid,
          externalKey: repository.fullName,
          scopeKey: bitbucketRepositoryScopeKey,
        })),
        nextCursor: page.nextCursor,
      } satisfies ScopeDiscoveryPage;
    },
    exchangeAuthorizationCode: (code) => oauth.exchangeAuthorizationCode(code),
    async getCommit(
      credentials,
      resource,
      allowedRepositoryIds,
      repositoryId,
      commitHash,
    ) {
      const path = repositoryPath(resource, allowedRepositoryIds, repositoryId);
      const parsed = commitSchema.safeParse(
        await oauth.getJson(
          apiUrl(
            `repositories/${path}/commit/${encodeURIComponent(commitHash)}`,
          ),
          credentials.accessToken,
        ),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      const diff = await boundedDiff(path, commitHash, credentials);
      return { ...toCommit(parsed.data), diff };
    },
    async getFile(
      credentials,
      resource,
      allowedRepositoryIds,
      repositoryId,
      path,
      ref,
    ) {
      const repoPath = repositoryPath(
        resource,
        allowedRepositoryIds,
        repositoryId,
      );
      const segments = path
        .split("/")
        .filter((segment) => segment.length > 0)
        .map(encodeURIComponent)
        .join("/");

      if (segments.length === 0) {
        throw new ProviderAdapterError("invalid_request");
      }

      const downloaded = await oauth.getBytes(
        apiUrl(
          `repositories/${repoPath}/src/${encodeURIComponent(ref)}/${segments}`,
        ),
        credentials.accessToken,
        maximumFileBytes,
      );

      if (downloaded.contentType.includes("application/json")) {
        // Bitbucket returns a JSON directory listing instead of raw bytes
        // when `path` names a directory rather than a file.
        throw new ProviderAdapterError(
          "invalid_request",
          "The path must point to a file, not a directory.",
        );
      }

      const bounded = boundText(
        new TextDecoder("utf-8", { fatal: false }).decode(downloaded.bytes),
        maximumFileCharacters,
      );
      return { content: bounded.text, path, truncated: bounded.truncated };
    },
    getIdentity: (credentials) => oauth.getIdentity(credentials),
    async getPullRequest(
      credentials,
      resource,
      allowedRepositoryIds,
      repositoryId,
      pullRequestId,
    ) {
      const path = repositoryPath(resource, allowedRepositoryIds, repositoryId);
      const parsed = pullRequestSchema.safeParse(
        await oauth.getJson(
          apiUrl(`repositories/${path}/pullrequests/${String(pullRequestId)}`),
          credentials.accessToken,
        ),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      return toPullRequest(parsed.data);
    },
    async getPullRequestDiff(
      credentials,
      resource,
      allowedRepositoryIds,
      repositoryId,
      pullRequestId,
    ) {
      const path = repositoryPath(resource, allowedRepositoryIds, repositoryId);
      const downloaded = await oauth.getBytes(
        apiUrl(
          `repositories/${path}/pullrequests/${String(pullRequestId)}/diff`,
        ),
        credentials.accessToken,
        maximumDiffBytes,
      );
      return boundText(
        new TextDecoder("utf-8", { fatal: false }).decode(downloaded.bytes),
        maximumDiffCharacters,
      );
    },
    async getRepository(
      credentials,
      resource,
      allowedRepositoryIds,
      repositoryId,
    ) {
      const path = repositoryPath(resource, allowedRepositoryIds, repositoryId);
      const parsed = repositorySchema.safeParse(
        await oauth.getJson(
          apiUrl(`repositories/${path}`),
          credentials.accessToken,
        ),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      return toRepository(parsed.data);
    },
    async listAllowedRepositories(credentials, resource, allowedRepositoryIds) {
      const allowed = new Set(allowedRepositoryIds);
      const repositories: BitbucketRepository[] = [];
      let cursor: string | null = null;
      let pages = 0;

      while (pages < 40 && repositories.length < allowed.size) {
        const page = await listRepositoriesPage(
          credentials,
          resource,
          "",
          cursor,
        );
        for (const repository of page.items) {
          if (allowed.has(repository.uuid)) {
            repositories.push(repository);
          }
        }
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
        pages += 1;
      }

      return repositories;
    },
    async listCommits(
      credentials,
      resource,
      allowedRepositoryIds,
      repositoryId,
      branch,
      cursor,
      limit,
    ) {
      const path = repositoryPath(resource, allowedRepositoryIds, repositoryId);
      let url: string;

      if (cursor !== null) {
        url = cursor;
      } else {
        const initial = new URL(
          apiUrl(
            `repositories/${path}/commits${branch === null ? "" : `/${encodeURIComponent(branch)}`}`,
          ),
        );
        initial.searchParams.set("pagelen", String(limit));
        url = initial.toString();
      }

      const parsed = commitPageSchema.safeParse(
        await oauth.getJson(url, credentials.accessToken),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      return {
        items: parsed.data.values.map(toCommit),
        nextCursor: parsed.data.next ?? null,
      };
    },
    async listPullRequestComments(
      credentials,
      resource,
      allowedRepositoryIds,
      repositoryId,
      pullRequestId,
      cursor,
      limit,
    ) {
      const path = repositoryPath(resource, allowedRepositoryIds, repositoryId);
      let url: string;

      if (cursor !== null) {
        url = cursor;
      } else {
        const initial = new URL(
          apiUrl(
            `repositories/${path}/pullrequests/${String(pullRequestId)}/comments`,
          ),
        );
        initial.searchParams.set("pagelen", String(limit));
        url = initial.toString();
      }

      const parsed = pullRequestCommentPageSchema.safeParse(
        await oauth.getJson(url, credentials.accessToken),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      return {
        items: parsed.data.values
          .filter((comment) => !comment.deleted)
          .map((comment) => ({
            author: comment.user?.display_name ?? null,
            body: comment.content.raw,
            createdAt: toIsoDate(comment.created_on),
            deleted: comment.deleted,
            id: comment.id,
          })),
        nextCursor: parsed.data.next ?? null,
      };
    },
    async listPullRequests(
      credentials,
      resource,
      allowedRepositoryIds,
      repositoryId,
      state,
      cursor,
      limit,
    ) {
      const path = repositoryPath(resource, allowedRepositoryIds, repositoryId);
      let url: string;

      if (cursor !== null) {
        url = cursor;
      } else {
        const initial = new URL(apiUrl(`repositories/${path}/pullrequests`));
        initial.searchParams.set("pagelen", String(limit));

        if (state !== null) {
          initial.searchParams.set("state", state);
        }

        url = initial.toString();
      }

      const parsed = pullRequestPageSchema.safeParse(
        await oauth.getJson(url, credentials.accessToken),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      return {
        items: parsed.data.values.map(toPullRequest),
        nextCursor: parsed.data.next ?? null,
      };
    },
    provider: bitbucketProviderKey,
    refreshCredentials: (credentials) => oauth.refreshCredentials(credentials),
    async resolveScopes(credentials, resource, externalIds) {
      const pending = new Set(externalIds);
      const resolved: DiscoveredScope[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const page = await listRepositoriesPage(
          credentials,
          resource,
          "",
          cursor,
        );

        for (const repository of page.items) {
          if (pending.delete(repository.uuid)) {
            resolved.push({
              displayName: repository.fullName,
              externalId: repository.uuid,
              externalKey: repository.fullName,
              scopeKey: bitbucketRepositoryScopeKey,
            });
          }
        }

        cursor = page.nextCursor;
        pages += 1;
      } while (pending.size > 0 && cursor !== null && pages < 40);

      if (pending.size > 0) {
        throw new ProviderAdapterError(
          "inaccessible_resource",
          "One or more Bitbucket repositories are unavailable.",
        );
      }

      return resolved;
    },
    async searchCode(
      credentials,
      resource,
      allowedRepositoryIds,
      query,
      cursor,
      limit,
    ) {
      const allowed = new Set(allowedRepositoryIds);
      let url: string;

      if (cursor !== null) {
        url = cursor;
      } else {
        const initial = new URL(
          apiUrl(
            `workspaces/${encodeURIComponent(resource.externalId)}/search/code`,
          ),
        );
        initial.searchParams.set("search_query", query);
        initial.searchParams.set("pagelen", String(limit));
        url = initial.toString();
      }

      const parsed = codeSearchPageSchema.safeParse(
        await oauth.getJson(url, credentials.accessToken),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      // Bitbucket's code search is workspace-wide and has no per-request
      // repository allowlist parameter, so matches from repositories outside
      // the workspace allowlist are filtered out here rather than at the
      // provider. A filtered page may therefore return fewer than `limit`
      // items even when more allowed matches exist on the next page.
      const items = parsed.data.values
        .filter((match) => allowed.has(match.file.commit.repository.uuid))
        .map((match) => ({
          commitHash: match.file.commit.hash,
          path: match.file.path,
          repositoryId: match.file.commit.repository.uuid,
          snippet: boundText(
            match.content_matches
              .flatMap((entry) =>
                entry.lines.map((line) =>
                  line.segments.map((segment) => segment.text).join(""),
                ),
              )
              .join("\n"),
            maximumSnippetCharacters,
          ).text,
        }));

      return { items, nextCursor: parsed.data.next ?? null };
    },
  };

  return adapter;
}
