import Link from "next/link";

import { McpConnectionList } from "@/components/mcp/connection-list";
import { Button } from "@/components/ui/button";
import { getBundleListState } from "@/lib/server/integration-bundle";
import { getMcpConnections } from "@/lib/server/mcp-connections";

export default async function AccountPage() {
  const [state, bundleState] = await Promise.all([
    getMcpConnections(),
    getBundleListState(),
  ]);
  const bundles =
    bundleState.status === "available"
      ? bundleState.data.map((bundle) => ({ id: bundle.id, name: bundle.name }))
      : [];

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 md:px-8 md:py-14">
      <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">
        Account settings
      </p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.05em]">
            Connected MCP clients
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            These personal authorizations let MCP clients act through your
            current workspace membership. Revocation takes effect immediately.
          </p>
        </div>
        <Button asChild size="sm" variant="default">
          <Link href="/agent-setup">Connect a client</Link>
        </Button>
      </div>

      <section className="mt-8" aria-labelledby="mcp-connections-heading">
        <h2 className="sr-only" id="mcp-connections-heading">
          MCP connections
        </h2>
        {state === null ? (
          <div className="border border-destructive/30 bg-destructive/5 p-6">
            <p className="text-sm font-medium">Connections are unavailable.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Refresh the page to try again.
            </p>
          </div>
        ) : (
          <McpConnectionList
            bundles={bundles}
            connections={state.connections}
          />
        )}
      </section>
    </main>
  );
}
