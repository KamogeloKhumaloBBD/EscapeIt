import { createJiraMcpToolProvider } from "./mcp-tools";
import type { AtlassianOAuthConfig } from "../config";
import { createJiraAdapter } from "./adapter";
import type { ProviderModule } from "../provider-module";
import { jiraDefinition, jiraProvider } from "./definition";

export function createJiraProviderModule({
  oauth,
  publicAppUrl,
}: {
  oauth: AtlassianOAuthConfig | null;
  publicAppUrl: string;
}): ProviderModule | null {
  if (oauth === null) {
    return null;
  }

  const adapter = createJiraAdapter({
    ...oauth,
    redirectUri: new URL(
      "/api/integrations/jira/oauth/callback",
      publicAppUrl,
    ).toString(),
  });

  return {
    adapter,
    createMcpToolProvider: ({ accountRuntime, repository }) =>
      createJiraMcpToolProvider({
        accountRuntime,
        adapter,
        repository: {
          appendActivity: (input) => repository.appendActivity(input),
          findAccess: (workspaceId, membershipId) =>
            repository.findAccess(workspaceId, membershipId, jiraProvider),
        },
      }),
    definition: jiraDefinition,
  };
}
