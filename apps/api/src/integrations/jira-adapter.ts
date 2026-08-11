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

export const jiraOAuthScopes = [
  "offline_access",
  "read:me",
  "read:jira-user",
  "read:jira-work",
  "write:jira-work",
] as const;

export function createJiraAdapter(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): IntegrationAdapter {
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

  return {
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
  };
}
