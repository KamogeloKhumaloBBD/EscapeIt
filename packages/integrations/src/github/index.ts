import type { GitHubAppConfig } from "../config";
import type { ProviderModule } from "../provider-module";
import { createGitHubAdapter } from "./adapter";
import { githubDefinition, githubProvider } from "./definition";
import { createGitHubMcpToolProvider } from "./mcp-tools";

export function createGitHubProviderModule({
  app,
  publicAppUrl,
}: {
  app: GitHubAppConfig | null;
  publicAppUrl: string;
}): ProviderModule | null {
  if (app === null) return null;

  const adapter = createGitHubAdapter({
    ...app,
    redirectUri: new URL(
      "/api/integrations/github/oauth/callback",
      publicAppUrl,
    ).toString(),
  });

  return {
    adapter,
    createMcpToolProvider: ({ accountRuntime, repository }) =>
      createGitHubMcpToolProvider({
        accountRuntime,
        adapter,
        repository: {
          appendActivity: (input) => repository.appendActivity(input),
          findAccess: (workspaceId, membershipId) =>
            repository.findAccess(workspaceId, membershipId, githubProvider),
        },
      }),
    definition: githubDefinition,
  };
}
