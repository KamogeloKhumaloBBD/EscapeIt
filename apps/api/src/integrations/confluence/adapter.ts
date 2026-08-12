import { parseProviderKey, parseScopeKey } from "@context-layer/db";
import { z } from "zod";

import {
  adfToTextValue,
  type AtlassianTextValue,
} from "../atlassian/adf-reader";
import type { AtlassianAdfDocument } from "../atlassian/adf-schema";
import {
  extractAttachment,
  maximumAttachmentBytes,
  type AtlassianAttachmentContent,
  type AttachmentMetadata,
} from "../atlassian/attachments";
import {
  ProviderAdapterError,
  type IntegrationAdapter,
  type OAuthCredentials,
  type ProviderResource,
  type ScopeDiscoveryPage,
} from "../integration-adapter";
import { createConfluenceOAuthClient } from "./oauth-client";

const confluenceProviderKey = parseProviderKey("confluence");
const confluenceSpaceScopeKey = parseScopeKey("confluence.space");
const maximumPageCharacters = 50_000;
const maximumCommentCharacters = 10_000;

const linksSchema = z.object({
  next: z.string().optional(),
  webui: z.string().optional(),
});

const spaceSchema = z.object({
  _links: linksSchema.optional(),
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  status: z.string().default("current"),
  type: z.string().default("global"),
});

const spacePageSchema = z.object({
  _links: linksSchema.optional(),
  results: z.array(spaceSchema),
});

const labelSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  prefix: z.string().optional(),
});

const pageSchema = z.object({
  _links: linksSchema.optional(),
  authorId: z.string().optional(),
  body: z
    .object({
      atlas_doc_format: z
        .object({ representation: z.string().optional(), value: z.unknown() })
        .optional(),
    })
    .optional(),
  createdAt: z.string().optional(),
  id: z.string().min(1),
  labels: z
    .union([z.array(labelSchema), z.object({ results: z.array(labelSchema) })])
    .optional(),
  parentId: z.string().nullable().optional(),
  spaceId: z.string().min(1),
  status: z.string().default("current"),
  title: z.string().min(1),
  version: z
    .object({
      createdAt: z.string().optional(),
      number: z.number().int().nonnegative().default(0),
    })
    .optional(),
});

const pagePageSchema = z.object({
  _links: linksSchema.optional(),
  results: z.array(pageSchema),
});

const commentSchema = z.object({
  body: z.object({
    atlas_doc_format: z
      .object({ representation: z.string().optional(), value: z.unknown() })
      .optional(),
  }),
  id: z.string().min(1),
  parentCommentId: z.string().nullable().optional(),
  status: z.string().default("current"),
  version: z
    .object({
      authorId: z.string().optional(),
      createdAt: z.string().optional(),
    })
    .optional(),
});

const commentPageSchema = z.object({
  _links: linksSchema.optional(),
  results: z.array(commentSchema),
});

const attachmentSchema = z.object({
  createdAt: z.string().optional(),
  fileSize: z.number().int().nonnegative().default(0),
  id: z.string().min(1),
  mediaType: z.string().min(1).max(200),
  pageId: z.string().min(1).optional(),
  title: z.string().min(1).max(500),
  version: z.object({ authorId: z.string().optional() }).optional(),
});

const attachmentPageSchema = z.object({
  _links: linksSchema.optional(),
  results: z.array(attachmentSchema),
});

const searchSchema = z.object({
  _links: linksSchema.optional(),
  results: z.array(
    z.object({
      content: z.object({
        _links: linksSchema.optional(),
        id: z.string().min(1),
        space: z.object({ id: z.string().min(1), key: z.string().min(1) }),
        status: z.string().default("current"),
        title: z.string().min(1),
        type: z.literal("page"),
      }),
      excerpt: z.string().default(""),
      lastModified: z.string().optional(),
    }),
  ),
});

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  status: string;
  type: string;
  url: string;
}

export interface ConfluencePageSummary {
  createdAt: string | null;
  id: string;
  parentId: string | null;
  spaceId: string;
  status: string;
  title: string;
  updatedAt: string | null;
  url: string;
  version: number;
}

export interface ConfluencePage extends ConfluencePageSummary {
  authorId: string | null;
  body: AtlassianTextValue;
  labels: readonly string[];
}

export interface ConfluenceComment {
  authorId: string | null;
  body: AtlassianTextValue;
  createdAt: string | null;
  id: string;
  parentCommentId: string | null;
  status: string;
  type: "footer" | "inline";
  updatedAt: string | null;
}

export interface ConfluencePageResult<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export interface ConfluenceSearchInput {
  cursor: string | null;
  limit: number;
  spaceId?: string;
  text?: string;
  title?: string;
}

export interface ConfluenceCreatePageInput {
  body?: AtlassianAdfDocument;
  parentPageId?: string;
  spaceId: string;
  title: string;
}

export interface ConfluenceUpdatePageInput {
  body?: AtlassianAdfDocument;
  expectedVersion: number;
  pageId: string;
  title?: string;
}

export class ConfluenceVersionConflictError extends Error {
  constructor() {
    super("The Confluence page changed since it was retrieved.");
    this.name = "ConfluenceVersionConflictError";
  }
}

export interface ConfluenceAdapter extends IntegrationAdapter {
  addPageComment(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    pageId: string,
    body: AtlassianAdfDocument,
  ): Promise<ConfluenceComment | null>;
  createPage(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    input: ConfluenceCreatePageInput,
  ): Promise<ConfluencePage>;
  getPage(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    pageId: string,
  ): Promise<ConfluencePage | null>;
  getPageAttachment(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    pageId: string,
    attachmentId: string,
  ): Promise<AtlassianAttachmentContent | null>;
  getPageChildren(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    pageId: string,
    cursor: string | null,
    limit: number,
  ): Promise<ConfluencePageResult<ConfluencePageSummary> | null>;
  getPageComments(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    pageId: string,
    type: "footer" | "inline",
    cursor: string | null,
    limit: number,
  ): Promise<ConfluencePageResult<ConfluenceComment> | null>;
  listAllowedSpaces(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
  ): Promise<readonly ConfluenceSpace[]>;
  listPageAttachments(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    pageId: string,
    cursor: string | null,
    limit: number,
  ): Promise<ConfluencePageResult<AttachmentMetadata> | null>;
  listPages(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    spaceId: string,
    cursor: string | null,
    limit: number,
  ): Promise<ConfluencePageResult<ConfluencePageSummary>>;
  searchPages(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    input: ConfluenceSearchInput,
  ): Promise<ConfluencePageResult<ConfluencePageSummary & { excerpt: string }>>;
  updatePage(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    input: ConfluenceUpdatePageInput,
  ): Promise<ConfluencePage | null>;
}

function isoDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ProviderAdapterError("invalid_response");
  }
  return parsed.toISOString();
}

function nextParameter(
  next: string | undefined,
  parameter = "cursor",
): string | null {
  if (next === undefined) return null;
  try {
    return new URL(next, "https://api.atlassian.com").searchParams.get(
      parameter,
    );
  } catch {
    throw new ProviderAdapterError("invalid_response");
  }
}

function adfValue(body: z.infer<typeof pageSchema>["body"]): unknown {
  const value = body?.atlas_doc_format?.value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ProviderAdapterError("invalid_response");
  }
}

function rawAdfValue(body: z.infer<typeof pageSchema>["body"]): string {
  const value = body?.atlas_doc_format?.value;
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      throw new ProviderAdapterError("invalid_response");
    }
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  throw new ProviderAdapterError("invalid_response");
}

function writeAdf(value: AtlassianAdfDocument): {
  representation: string;
  value: string;
} {
  return {
    representation: "atlas_doc_format",
    value: JSON.stringify(value),
  };
}

function pageUrl(resource: ProviderResource, pageId: string): string {
  return `${resource.url.replace(/\/$/, "")}/wiki/pages/viewpage.action?pageId=${encodeURIComponent(pageId)}`;
}

function toPageSummary(
  page: z.infer<typeof pageSchema>,
  resource: ProviderResource,
): ConfluencePageSummary {
  return {
    createdAt: isoDate(page.createdAt),
    id: page.id,
    parentId: page.parentId ?? null,
    spaceId: page.spaceId,
    status: page.status,
    title: page.title,
    updatedAt: isoDate(page.version?.createdAt),
    url: pageUrl(resource, page.id),
    version: page.version?.number ?? 0,
  };
}

function labels(page: z.infer<typeof pageSchema>): string[] {
  if (page.labels === undefined) return [];
  const values = Array.isArray(page.labels) ? page.labels : page.labels.results;
  return values.slice(0, 100).map((label) => label.name);
}

function toPage(
  page: z.infer<typeof pageSchema>,
  resource: ProviderResource,
): ConfluencePage {
  return {
    ...toPageSummary(page, resource),
    authorId: page.authorId ?? null,
    body: adfToTextValue(adfValue(page.body), maximumPageCharacters),
    labels: labels(page),
  };
}

function toComment(
  comment: z.infer<typeof commentSchema>,
  type: "footer" | "inline",
): ConfluenceComment {
  return {
    authorId: comment.version?.authorId ?? null,
    body: adfToTextValue(
      adfValue({ atlas_doc_format: comment.body.atlas_doc_format }),
      maximumCommentCharacters,
    ),
    createdAt: isoDate(comment.version?.createdAt),
    id: comment.id,
    parentCommentId: comment.parentCommentId ?? null,
    status: comment.status,
    type,
    updatedAt: isoDate(comment.version?.createdAt),
  };
}

function requireScopes(
  credentials: OAuthCredentials,
  scopes: readonly string[],
): void {
  if (scopes.some((scope) => !credentials.scopes.includes(scope))) {
    throw new ProviderAdapterError("authorization_expired");
  }
}

function toAttachmentMetadata(
  attachment: z.infer<typeof attachmentSchema>,
): AttachmentMetadata {
  return {
    author: attachment.version?.authorId ?? null,
    createdAt: isoDate(attachment.createdAt) ?? new Date(0).toISOString(),
    filename: attachment.title,
    id: attachment.id,
    mimeType: attachment.mediaType,
    size: attachment.fileSize,
  };
}

function cqlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function createConfluenceAdapter(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): ConfluenceAdapter {
  const oauth = createConfluenceOAuthClient(config);

  function apiUrl(resource: ProviderResource, path: string): string {
    return `https://api.atlassian.com/ex/confluence/${encodeURIComponent(resource.externalId)}/wiki/api/v2/${path}`;
  }

  function legacyUrl(resource: ProviderResource, path: string): string {
    return `https://api.atlassian.com/ex/confluence/${encodeURIComponent(resource.externalId)}/wiki/rest/api/${path}`;
  }

  async function requestSpaces(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    cursor: string | null,
    ids: readonly string[] = [],
  ) {
    const url = new URL(apiUrl(resource, "spaces"));
    url.searchParams.set("limit", "50");
    if (cursor !== null) url.searchParams.set("cursor", cursor);
    for (const id of ids) url.searchParams.append("ids", id);
    const parsed = spacePageSchema.safeParse(
      await oauth.getJson(url.toString(), credentials.accessToken),
    );
    if (!parsed.success) throw new ProviderAdapterError("invalid_response");
    return parsed.data;
  }

  async function resolveSpaces(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    ids: readonly string[],
  ): Promise<ConfluenceSpace[]> {
    if (ids.length === 0) return [];
    const allowed = new Set(ids);
    const resolved: ConfluenceSpace[] = [];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const page = await requestSpaces(
        credentials,
        resource,
        null,
        ids.slice(offset, offset + 50),
      );
      for (const space of page.results) {
        if (!allowed.has(space.id)) continue;
        resolved.push({
          id: space.id,
          key: space.key,
          name: space.name,
          status: space.status,
          type: space.type,
          url: `${resource.url.replace(/\/$/, "")}/wiki/spaces/${encodeURIComponent(space.key)}`,
        });
      }
    }
    return resolved;
  }

  async function requestPage(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    pageId: string,
  ) {
    const url = new URL(
      apiUrl(resource, `pages/${encodeURIComponent(pageId)}`),
    );
    url.searchParams.set("body-format", "atlas_doc_format");
    url.searchParams.set("include-labels", "true");
    try {
      const parsed = pageSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      return parsed.data;
    } catch (error) {
      if (error instanceof ProviderAdapterError && error.code === "not_found") {
        return null;
      }
      throw error;
    }
  }

  async function allowedPage(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    allowedSpaceIds: readonly string[],
    pageId: string,
  ) {
    const page = await requestPage(credentials, resource, pageId);
    if (page === null || !allowedSpaceIds.includes(page.spaceId)) return null;
    return page;
  }

  const adapter: ConfluenceAdapter = {
    async addPageComment(credentials, resource, allowedSpaceIds, pageId, body) {
      requireScopes(credentials, ["write:comment:confluence"]);
      if (
        (await allowedPage(credentials, resource, allowedSpaceIds, pageId)) ===
        null
      ) {
        return null;
      }
      const parsed = commentSchema.safeParse(
        await oauth.postJson(
          apiUrl(resource, "footer-comments"),
          credentials.accessToken,
          { body: writeAdf(body), pageId },
        ),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      return toComment(parsed.data, "footer");
    },
    buildAuthorizationUrl: (state) => oauth.buildAuthorizationUrl(state),
    async createPage(credentials, resource, allowedSpaceIds, input) {
      requireScopes(credentials, ["write:page:confluence"]);
      if (!allowedSpaceIds.includes(input.spaceId)) {
        throw new ProviderAdapterError("inaccessible_resource");
      }
      if (input.parentPageId !== undefined) {
        const parent = await allowedPage(
          credentials,
          resource,
          allowedSpaceIds,
          input.parentPageId,
        );
        if (parent?.spaceId !== input.spaceId) {
          throw new ProviderAdapterError("inaccessible_resource");
        }
      }
      const parsed = pageSchema.safeParse(
        await oauth.postJson(
          apiUrl(resource, "pages"),
          credentials.accessToken,
          {
            ...(input.body === undefined ? {} : { body: writeAdf(input.body) }),
            ...(input.parentPageId === undefined
              ? {}
              : { parentId: input.parentPageId }),
            spaceId: input.spaceId,
            status: "current",
            title: input.title,
          },
        ),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      if (parsed.data.spaceId !== input.spaceId) {
        throw new ProviderAdapterError("invalid_response");
      }
      return toPage(parsed.data, resource);
    },
    discoverResources: (credentials) => oauth.discoverResources(credentials),
    async discoverScopes(credentials, resource, query, cursor) {
      const normalized = query.trim().toLocaleLowerCase();
      const items: ScopeDiscoveryPage["items"][number][] = [];
      let next = cursor;
      for (
        let pageNumber = 0;
        pageNumber < 10 && items.length < 50;
        pageNumber += 1
      ) {
        const page = await requestSpaces(credentials, resource, next);
        for (const space of page.results) {
          if (
            normalized.length > 0 &&
            !`${space.name} ${space.key}`
              .toLocaleLowerCase()
              .includes(normalized)
          ) {
            continue;
          }
          items.push({
            displayName: `${space.name} (${space.key})`,
            externalId: space.id,
            scopeKey: confluenceSpaceScopeKey,
          });
          if (items.length === 50) break;
        }
        next = nextParameter(page._links?.next);
        if (next === null) break;
      }
      return { items, nextCursor: next };
    },
    exchangeAuthorizationCode: (code) => oauth.exchangeAuthorizationCode(code),
    async getPage(credentials, resource, allowedSpaceIds, pageId) {
      const page = await allowedPage(
        credentials,
        resource,
        allowedSpaceIds,
        pageId,
      );
      return page === null ? null : toPage(page, resource);
    },
    async getPageAttachment(
      credentials,
      resource,
      allowedSpaceIds,
      pageId,
      attachmentId,
    ) {
      if (
        (await allowedPage(credentials, resource, allowedSpaceIds, pageId)) ===
        null
      ) {
        return null;
      }
      let attachment: z.infer<typeof attachmentSchema>;
      try {
        const parsed = attachmentSchema.safeParse(
          await oauth.getJson(
            apiUrl(resource, `attachments/${encodeURIComponent(attachmentId)}`),
            credentials.accessToken,
          ),
        );
        if (!parsed.success) throw new ProviderAdapterError("invalid_response");
        attachment = parsed.data;
      } catch (error) {
        if (
          error instanceof ProviderAdapterError &&
          error.code === "not_found"
        ) {
          return null;
        }
        throw error;
      }
      if (attachment.pageId !== pageId) return null;
      if (attachment.fileSize > maximumAttachmentBytes) {
        throw new ProviderAdapterError("content_too_large");
      }
      const downloadUrl = legacyUrl(
        resource,
        `content/${encodeURIComponent(pageId)}/child/attachment/${encodeURIComponent(attachmentId)}/download`,
      );
      const downloaded = await oauth.getBytesFromAtlassianRedirect(
        downloadUrl,
        credentials.accessToken,
        maximumAttachmentBytes,
      );
      return extractAttachment(
        toAttachmentMetadata(attachment),
        downloaded.bytes,
        downloaded.contentType,
      );
    },
    async getPageChildren(
      credentials,
      resource,
      allowedSpaceIds,
      pageId,
      cursor,
      limit,
    ) {
      if (
        (await allowedPage(credentials, resource, allowedSpaceIds, pageId)) ===
        null
      ) {
        return null;
      }
      const url = new URL(
        apiUrl(resource, `pages/${encodeURIComponent(pageId)}/children`),
      );
      url.searchParams.set("limit", String(limit));
      if (cursor !== null) url.searchParams.set("cursor", cursor);
      const parsed = pagePageSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      return {
        items: parsed.data.results
          .filter((page) => allowedSpaceIds.includes(page.spaceId))
          .map((page) => toPageSummary(page, resource)),
        nextCursor: nextParameter(parsed.data._links?.next),
      };
    },
    async getPageComments(
      credentials,
      resource,
      allowedSpaceIds,
      pageId,
      type,
      cursor,
      limit,
    ) {
      if (
        (await allowedPage(credentials, resource, allowedSpaceIds, pageId)) ===
        null
      ) {
        return null;
      }
      const url = new URL(
        apiUrl(
          resource,
          `pages/${encodeURIComponent(pageId)}/${type === "footer" ? "footer-comments" : "inline-comments"}`,
        ),
      );
      url.searchParams.set("body-format", "atlas_doc_format");
      url.searchParams.set("limit", String(limit));
      if (cursor !== null) url.searchParams.set("cursor", cursor);
      const parsed = commentPageSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      return {
        items: parsed.data.results.map((comment) => toComment(comment, type)),
        nextCursor: nextParameter(parsed.data._links?.next),
      };
    },
    getIdentity: (credentials) => oauth.getIdentity(credentials),
    listAllowedSpaces: resolveSpaces,
    async listPageAttachments(
      credentials,
      resource,
      allowedSpaceIds,
      pageId,
      cursor,
      limit,
    ) {
      if (
        (await allowedPage(credentials, resource, allowedSpaceIds, pageId)) ===
        null
      ) {
        return null;
      }
      const url = new URL(
        apiUrl(resource, `pages/${encodeURIComponent(pageId)}/attachments`),
      );
      url.searchParams.set("limit", String(limit));
      if (cursor !== null) url.searchParams.set("cursor", cursor);
      const parsed = attachmentPageSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      return {
        items: parsed.data.results.map(toAttachmentMetadata),
        nextCursor: nextParameter(parsed.data._links?.next),
      };
    },
    async listPages(
      credentials,
      resource,
      allowedSpaceIds,
      spaceId,
      cursor,
      limit,
    ) {
      if (!allowedSpaceIds.includes(spaceId)) {
        throw new ProviderAdapterError("inaccessible_resource");
      }
      const url = new URL(
        apiUrl(resource, `spaces/${encodeURIComponent(spaceId)}/pages`),
      );
      url.searchParams.set("limit", String(limit));
      if (cursor !== null) url.searchParams.set("cursor", cursor);
      const parsed = pagePageSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      return {
        items: parsed.data.results
          .filter((page) => page.spaceId === spaceId)
          .map((page) => toPageSummary(page, resource)),
        nextCursor: nextParameter(parsed.data._links?.next),
      };
    },
    provider: confluenceProviderKey,
    refreshCredentials: (credentials) => oauth.refreshCredentials(credentials),
    async resolveScopes(credentials, resource, externalIds) {
      const spaces = await resolveSpaces(credentials, resource, externalIds);
      if (spaces.length !== new Set(externalIds).size) {
        throw new ProviderAdapterError("inaccessible_resource");
      }
      return spaces.map((space) => ({
        displayName: `${space.name} (${space.key})`,
        externalId: space.id,
        scopeKey: confluenceSpaceScopeKey,
      }));
    },
    async searchPages(credentials, resource, allowedSpaceIds, input) {
      const selectedIds =
        input.spaceId === undefined ? allowedSpaceIds : [input.spaceId];
      if (
        selectedIds.length === 0 ||
        selectedIds.some((id) => !allowedSpaceIds.includes(id))
      ) {
        throw new ProviderAdapterError("inaccessible_resource");
      }
      const spaces = await resolveSpaces(credentials, resource, selectedIds);
      if (spaces.length !== selectedIds.length) {
        throw new ProviderAdapterError("inaccessible_resource");
      }
      const clauses = [
        "type = page",
        `space in (${spaces.map((space) => cqlString(space.key)).join(", ")})`,
      ];
      if (input.title !== undefined) {
        clauses.push(`title ~ ${cqlString(input.title)}`);
      }
      if (input.text !== undefined) {
        clauses.push(`text ~ ${cqlString(input.text)}`);
      }
      const url = new URL(legacyUrl(resource, "search"));
      url.searchParams.set(
        "cql",
        `${clauses.join(" AND ")} ORDER BY lastmodified DESC`,
      );
      url.searchParams.set("expand", "space,version");
      url.searchParams.set("limit", String(input.limit));
      if (input.cursor !== null) url.searchParams.set("start", input.cursor);
      const parsed = searchSchema.safeParse(
        await oauth.getJson(url.toString(), credentials.accessToken),
      );
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      const allowed = new Set(selectedIds);
      return {
        items: parsed.data.results
          .filter((result) => allowed.has(result.content.space.id))
          .map((result) => ({
            createdAt: null,
            excerpt: result.excerpt.slice(0, 2_000),
            id: result.content.id,
            parentId: null,
            spaceId: result.content.space.id,
            status: result.content.status,
            title: result.content.title,
            updatedAt: isoDate(result.lastModified),
            url: pageUrl(resource, result.content.id),
            version: 0,
          })),
        nextCursor: nextParameter(parsed.data._links?.next, "start"),
      };
    },
    async updatePage(credentials, resource, allowedSpaceIds, input) {
      requireScopes(credentials, ["write:page:confluence"]);
      const current = await allowedPage(
        credentials,
        resource,
        allowedSpaceIds,
        input.pageId,
      );
      if (current === null) return null;
      const currentVersion = current.version?.number ?? 0;
      if (currentVersion !== input.expectedVersion) {
        throw new ConfluenceVersionConflictError();
      }
      let response: unknown;
      try {
        response = await oauth.putJson(
          apiUrl(resource, `pages/${encodeURIComponent(input.pageId)}`),
          credentials.accessToken,
          {
            body:
              input.body === undefined
                ? {
                    representation: "atlas_doc_format",
                    value: rawAdfValue(current.body),
                  }
                : writeAdf(input.body),
            id: input.pageId,
            status: "current",
            title: input.title ?? current.title,
            version: { number: currentVersion + 1 },
          },
        );
      } catch (error) {
        if (
          error instanceof ProviderAdapterError &&
          error.providerStatus === 409
        ) {
          throw new ConfluenceVersionConflictError();
        }
        throw error;
      }
      const parsed = pageSchema.safeParse(response);
      if (!parsed.success) throw new ProviderAdapterError("invalid_response");
      if (
        parsed.data.id !== input.pageId ||
        !allowedSpaceIds.includes(parsed.data.spaceId)
      ) {
        throw new ProviderAdapterError("invalid_response");
      }
      return toPage(parsed.data, resource);
    },
  };

  return adapter;
}

export type { AtlassianTextValue as ConfluenceTextValue } from "../atlassian/adf-reader";
export type {
  AtlassianAttachmentContent as ConfluenceAttachmentContent,
  AttachmentMetadata,
} from "../atlassian/attachments";
