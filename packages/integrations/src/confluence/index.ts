import type { AtlassianOAuthConfig } from "../config";
import type { ProviderModule } from "../provider-module";
import { createConfluenceAdapter } from "./adapter";
import { confluenceDefinition, confluenceProvider } from "./definition";
import { createConfluenceMcpToolProvider } from "./mcp-tools";

export function createConfluenceProviderModule({
  oauth,
  publicAppUrl,
}: {
  oauth: AtlassianOAuthConfig | null;
  publicAppUrl: string;
}): ProviderModule | null {
  if (oauth === null) return null;

  const adapter = createConfluenceAdapter({
    ...oauth,
    redirectUri: new URL(
      "/api/integrations/confluence/oauth/callback",
      publicAppUrl,
    ).toString(),
  });

  return {
    adapter,
    createMcpToolProvider: ({ accountRuntime, repository }) =>
      createConfluenceMcpToolProvider({
        accountRuntime,
        adapter,
        repository: {
          appendActivity: (input) => repository.appendActivity(input),
          findAccess: (workspaceId, membershipId) =>
            repository.findAccess(
              workspaceId,
              membershipId,
              confluenceProvider,
            ),
        },
      }),
    definition: confluenceDefinition,
  };
}
