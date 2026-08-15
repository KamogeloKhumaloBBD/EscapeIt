import { createAtlassianOAuthClient } from "../atlassian/oauth-client";

export const jiraOAuthScopes = [
  "offline_access",
  "read:me",
  "read:jira-user",
  "read:jira-work",
  "write:jira-work",
  "manage:jira-webhook",
  "read:issue-details:jira",
] as const;

export function createJiraOAuthClient(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  return createAtlassianOAuthClient({
    ...config,
    resourceScopeMarker: "jira",
    scopes: jiraOAuthScopes,
  });
}
