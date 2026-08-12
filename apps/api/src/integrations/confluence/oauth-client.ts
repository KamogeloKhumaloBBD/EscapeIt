import { createAtlassianOAuthClient } from "../atlassian/oauth-client";

export const confluenceOAuthScopes = [
  "offline_access",
  "read:me",
  "read:space:confluence",
  "read:page:confluence",
  "read:comment:confluence",
  "read:attachment:confluence",
  "search:confluence",
  "write:page:confluence",
  "write:comment:confluence",
] as const;

export function createConfluenceOAuthClient(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  return createAtlassianOAuthClient({
    ...config,
    resourceScopeMarker: "confluence",
    scopes: confluenceOAuthScopes,
  });
}
