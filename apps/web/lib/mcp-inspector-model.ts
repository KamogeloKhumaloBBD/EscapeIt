import type { CustomMcpServer } from "@/lib/validation/custom-mcp";
import type { IntegrationDetail } from "@/lib/validation/integration";

export interface McpInspectorTool {
  description: string;
  displayName: string;
  kind: "read" | "write";
  name: string;
}

export interface McpInspectorProvider {
  configurationHref: string;
  configuredToolCount: number;
  customMcpServerId: string | null;
  displayName: string;
  id: string;
  provider: string | null;
  readiness: "dormant" | "ready" | "unavailable";
  readinessReason: string | null;
  sourceType: "custom-mcp" | "provider";
  tools: McpInspectorTool[];
}

export interface McpInspectorBundle {
  customMcpServerIds: string[];
  description: string | null;
  id: string;
  name: string;
  providers: string[];
}

export interface McpInspectorData {
  bundles: McpInspectorBundle[];
  providers: McpInspectorProvider[];
}

export function inspectorSourcesForBundle(
  providers: readonly McpInspectorProvider[],
  bundle: McpInspectorBundle | null,
): McpInspectorProvider[] {
  if (bundle === null) return [...providers];
  const bundleProviders = new Set(bundle.providers);
  const bundleCustomMcpServers = new Set(bundle.customMcpServerIds);

  return providers.filter((provider) =>
    provider.sourceType === "custom-mcp"
      ? provider.customMcpServerId !== null &&
        bundleCustomMcpServers.has(provider.customMcpServerId)
      : provider.provider !== null && bundleProviders.has(provider.provider),
  );
}

function integrationReadinessReason(
  integration: IntegrationDetail,
): string | null {
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

export function integrationInspectorSource(
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
    configurationHref: `/integrations/${integration.provider}`,
    configuredToolCount: enabledTools.length,
    customMcpServerId: null,
    displayName: integration.displayName,
    id: `provider:${integration.provider}`,
    provider: integration.provider,
    readiness: ready ? "ready" : "dormant",
    readinessReason: ready ? null : integrationReadinessReason(integration),
    sourceType: "provider",
    tools: ready ? enabledTools : [],
  };
}

function customMcpReadinessReason(server: CustomMcpServer): string | null {
  if (server.status === "error") {
    return "The workspace Custom MCP server needs attention.";
  }

  if (server.currentAccount?.status === "error") {
    return `Your ${server.name} account needs attention.`;
  }

  switch (server.nextStep) {
    case "connect_account":
      return server.status === "connected"
        ? `Your ${server.name} account is not connected.`
        : "The workspace Custom MCP connection is incomplete.";
    case "select_tools":
      return "No approved MCP tools are enabled for this server.";
    case "wait_for_owner":
      return "The workspace owner needs to finish this Custom MCP server's setup.";
    case "ready":
      return null;
  }
}

export function customMcpInspectorSource(
  server: CustomMcpServer,
): McpInspectorProvider {
  const enabledTools = server.tools
    .filter((tool) => tool.available && tool.enabled)
    .map(({ description, exposedName, kind, title }) => ({
      description,
      displayName: title,
      kind,
      name: exposedName,
    }));
  const ready = server.nextStep === "ready";
  const unavailable =
    server.status === "error" || server.currentAccount?.status === "error";

  return {
    configurationHref: `/integrations/custom/${server.id}`,
    configuredToolCount: enabledTools.length,
    customMcpServerId: server.id,
    displayName: server.name,
    id: `custom-mcp:${server.id}`,
    provider: null,
    readiness: ready ? "ready" : unavailable ? "unavailable" : "dormant",
    readinessReason: ready ? null : customMcpReadinessReason(server),
    sourceType: "custom-mcp",
    tools: ready ? enabledTools : [],
  };
}
