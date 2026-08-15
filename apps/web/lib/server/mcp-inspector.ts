import "server-only";

import type { ApiState } from "@/lib/server/api-state";
import { getBundleListState } from "@/lib/server/integration-bundle";
import {
  getIntegrationState,
  getIntegrationsState,
} from "@/lib/server/integration";
import type {
  IntegrationDetail,
  IntegrationSummary,
} from "@/lib/validation/integration";

export interface McpInspectorTool {
  description: string;
  displayName: string;
  kind: "read" | "write";
  name: string;
}

export interface McpInspectorProvider {
  configuredToolCount: number;
  displayName: string;
  provider: string;
  readiness: "dormant" | "ready" | "unavailable";
  readinessReason: string | null;
  tools: McpInspectorTool[];
}

export interface McpInspectorBundle {
  description: string | null;
  id: string;
  name: string;
  providers: string[];
}

export interface McpInspectorData {
  bundles: McpInspectorBundle[];
  providers: McpInspectorProvider[];
}

function unavailableProvider(
  integration: IntegrationSummary,
): McpInspectorProvider {
  return {
    configuredToolCount: integration.installation?.enabledMcpToolCount ?? 0,
    displayName: integration.displayName,
    provider: integration.provider,
    readiness: "unavailable",
    readinessReason: "We couldn't inspect this provider right now.",
    tools: [],
  };
}

function readinessReason(integration: IntegrationDetail): string | null {
  if (integration.installation?.status === "error") {
    return "The workspace installation needs attention.";
  }

  if (integration.currentAccount?.status === "error") {
    return `Your ${integration.displayName} account needs attention.`;
  }

  switch (integration.nextStep) {
    case "connect_account":
      return `Your ${integration.displayName} account is not connected.`;
    case "connect_provider":
    case "select_resource":
      return "The workspace provider connection is incomplete.";
    case "select_scopes":
      return "No workspace resources are allowlisted for this provider.";
    case "select_tools":
      return "No MCP tools are enabled for this provider.";
    case "wait_for_owner":
      return "The workspace owner needs to finish this provider's setup.";
    case "ready":
      return null;
  }
}

function providerFromDetail(
  integration: IntegrationDetail,
): McpInspectorProvider {
  const enabledTools = integration.mcpTools
    .filter((tool) => tool.enabled)
    .map(({ description, displayName, kind, name }) => ({
      description,
      displayName,
      kind,
      name,
    }));
  const ready = integration.nextStep === "ready";

  return {
    configuredToolCount: enabledTools.length,
    displayName: integration.displayName,
    provider: integration.provider,
    readiness: ready ? "ready" : "dormant",
    readinessReason: ready ? null : readinessReason(integration),
    tools: ready ? enabledTools : [],
  };
}

export async function getMcpInspectorState(): Promise<
  ApiState<McpInspectorData>
> {
  const [integrationsState, bundlesState] = await Promise.all([
    getIntegrationsState(),
    getBundleListState(),
  ]);

  if (
    integrationsState.status === "anonymous" ||
    bundlesState.status === "anonymous"
  ) {
    return { status: "anonymous" };
  }

  if (
    integrationsState.status !== "available" ||
    bundlesState.status !== "available"
  ) {
    return { status: "unavailable" };
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
        description: bundle.description,
        id: bundle.id,
        name: bundle.name,
        providers: bundle.providers.map((provider) => provider.provider),
      })),
      providers: installedContextProviders.map((integration, index) => {
        const detailState = detailStates[index];
        return detailState?.status === "available"
          ? providerFromDetail(detailState.data)
          : unavailableProvider(integration);
      }),
    },
    status: "available",
  };
}
