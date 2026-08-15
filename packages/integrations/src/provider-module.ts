import type {
  ActivityEvent,
  AppendActivityEventInput,
  MemberIntegrationAccess,
  ProviderKey,
} from "@context-layer/db";

import type { McpToolProvider } from "./mcp-tool-provider";
import type { IntegrationAdapter } from "./integration-adapter";
import type { ProviderAccountRuntime } from "./provider-account-runtime";
import type { ProviderDefinition } from "./provider-registry";

export interface ProviderModuleMcpDependencies {
  accountRuntime: ProviderAccountRuntime;
  repository: {
    appendActivity(input: AppendActivityEventInput): Promise<ActivityEvent>;
    findAccess(
      workspaceId: string,
      membershipId: string,
      provider: ProviderKey,
    ): Promise<MemberIntegrationAccess | null>;
  };
}

export interface ProviderModule {
  adapter: IntegrationAdapter;
  createMcpToolProvider?: (
    dependencies: ProviderModuleMcpDependencies,
  ) => McpToolProvider;
  definition: ProviderDefinition;
}

export function isProviderModule(
  providerModule: ProviderModule | null,
): providerModule is ProviderModule {
  return providerModule !== null;
}
