import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";

import { McpInspectorGraph } from "@/components/mcp-inspector/mcp-inspector-graph";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { WorkspacePage } from "@/components/workspace-page";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { getMcpInspectorState } from "@/lib/server/mcp-inspector";

export default async function McpInspectorPage() {
  const state = await getMcpInspectorState();

  if (state.status === "anonymous") redirect("/sign-in");

  return (
    <WorkspacePage className="max-w-[100rem]">
      <WorkspacePageHeader
        description="Explore the providers and tools your mcp can exposes"
        title="MCP Inspector"
      />

      {state.status === "available" ? (
        <McpInspectorGraph data={state.data} />
      ) : (
        <Alert className="mt-10" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>MCP inspector unavailable</AlertTitle>
          <AlertDescription>
            {state.status === "unavailable"
              ? state.message
              : "The MCP map was not found. Refresh the page to try again."}
          </AlertDescription>
        </Alert>
      )}
    </WorkspacePage>
  );
}
