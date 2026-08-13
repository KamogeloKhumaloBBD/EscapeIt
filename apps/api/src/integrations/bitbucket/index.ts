import type { BitbucketOAuthConfig } from "../../config/env";
import type { ProviderModule } from "../provider-module";
import { createBitbucketAdapter } from "./adapter";
import { bitbucketDefinition, bitbucketProvider } from "./definition";
import { createBitbucketMcpToolProvider } from "./mcp-tools";

export function createBitbucketProviderModule({
  oauth,
  publicAppUrl,
}: {
  oauth: BitbucketOAuthConfig | null;
  publicAppUrl: string;
}): ProviderModule | null {
  if (oauth === null) {
    return null;
  }

  const adapter = createBitbucketAdapter({
    ...oauth,
    redirectUri: new URL(
      "/api/integrations/bitbucket/oauth/callback",
      publicAppUrl,
    ).toString(),
  });

  return {
    adapter,
    createMcpToolProvider: ({ accountRuntime, repository }) =>
      createBitbucketMcpToolProvider({
        accountRuntime,
        adapter,
        repository: {
          appendActivity: (input) => repository.appendActivity(input),
          findAccess: (workspaceId, membershipId) =>
            repository.findAccess(workspaceId, membershipId, bitbucketProvider),
        },
      }),
    definition: bitbucketDefinition,
  };
}
