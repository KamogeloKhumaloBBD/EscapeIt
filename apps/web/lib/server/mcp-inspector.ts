import "server-only";

import type { ApiState } from "@/lib/server/api-state";
import { getCustomMcpServersState } from "@/lib/server/custom-mcp";
import { getBundleListState } from "@/lib/server/integration-bundle";
import {
  getIntegrationState,
  getIntegrationsState,
} from "@/lib/server/integration";
import {
  customMcpInspectorSource,
  integrationInspectorSource,
  type McpInspectorData,
  type McpInspectorProvider,
} from "@/lib/mcp-inspector-model";
import type { IntegrationSummary } from "@/lib/validation/integration";

export type {
  McpInspectorBundle,
  McpInspectorData,
  McpInspectorProvider,
  McpInspectorTool,
} from "@/lib/mcp-inspector-model";

function unavailableProvider(
  integration: IntegrationSummary,
  message: string,
): McpInspectorProvider {
  return {
    configurationHref: `/integrations/${integration.provider}`,
    configuredToolCount: integration.installation?.enabledMcpToolCount ?? 0,
    customMcpServerId: null,
    displayName: integration.displayName,
    id: `provider:${integration.provider}`,
    provider: integration.provider,
    readiness: "unavailable",
    readinessReason: message,
    sourceType: "provider",
    tools: [],
  };
}

export async function getMcpInspectorState(): Promise<
  ApiState<McpInspectorData>
> {
  const [integrationsState, customMcpState, bundlesState] = await Promise.all([
    getIntegrationsState(),
    getCustomMcpServersState(),
    getBundleListState(),
  ]);

  if (
    integrationsState.status === "anonymous" ||
    customMcpState.status === "anonymous" ||
    bundlesState.status === "anonymous"
  ) {
    return { status: "anonymous" };
  }

  if (
    integrationsState.status !== "available" ||
    customMcpState.status !== "available" ||
    bundlesState.status !== "available"
  ) {
    return {
      message:
        integrationsState.status === "unavailable"
          ? integrationsState.message
          : customMcpState.status === "unavailable"
            ? customMcpState.message
            : bundlesState.status === "unavailable"
              ? bundlesState.message
              : "We couldn't load the MCP map. Refresh the page to try again.",
      status: "unavailable",
    };
  }

  const installedContextProviders = integrationsState.data.filter(
    (integration) =>
      integration.installation !== null &&
      integration.capabilities.includes("context"),
  );
  const detailStates = await Promise.all(
    installedContextProviders.map((integration) =>
      getIntegrationState(integration.provider),
    ),
  );

  return {
    data: {
      bundles: bundlesState.data.map((bundle) => ({
        customMcpServerIds: bundle.customMcpServers.map((server) => server.id),
        description: bundle.description,
        id: bundle.id,
        name: bundle.name,
        providers: bundle.providers.map((provider) => provider.provider),
      })),
      providers: [
        ...installedContextProviders.map((integration, index) => {
          const detailState = detailStates[index];
          return detailState?.status === "available"
            ? integrationInspectorSource(detailState.data)
            : unavailableProvider(
                integration,
                detailState?.status === "unavailable"
                  ? detailState.message
                  : "This provider is no longer available. Review its integration setup.",
              );
        }),
        ...customMcpState.data.map(customMcpInspectorSource),
      ],
    },
    status: "available",
  };
}
