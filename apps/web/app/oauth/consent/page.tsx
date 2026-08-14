import Link from "next/link";
import { redirect } from "next/navigation";

import { ConsentForm } from "@/app/oauth/consent/consent-form";
import { McpClientMark } from "@/components/mcp/client-mark";
import { getBundleListState } from "@/lib/server/integration-bundle";
import { getMcpConnections } from "@/lib/server/mcp-connections";
import { getCurrentWorkspaceState } from "@/lib/server/workspace";
import { oauthAuthorizationReturnPath } from "@/lib/validation/return-path";

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const returnPath = oauthAuthorizationReturnPath(query);
  const clientId = typeof query.client_id === "string" ? query.client_id : null;
  const workspaceState = await getCurrentWorkspaceState();

  if (returnPath === null || clientId === null) {
    return (
      <ConsentShell>
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">
          Invalid authorization request
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Return to your MCP client and start the connection again.
        </p>
      </ConsentShell>
    );
  }

  if (workspaceState.status === "anonymous") {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnPath)}`);
  }

  if (workspaceState.status === "without-workspace") {
    return (
      <ConsentShell>
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">
          Finish workspace setup first
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          An MCP connection must be authorized for a workspace.
        </p>
        <Link
          className="mt-7 inline-block text-sm underline"
          href="/onboarding"
        >
          Continue to onboarding
        </Link>
      </ConsentShell>
    );
  }

  const [connectionState, bundleState] = await Promise.all([
    getMcpConnections(clientId),
    getBundleListState(),
  ]);
  const bundles =
    bundleState.status === "available"
      ? bundleState.data.map((bundle) => ({ id: bundle.id, name: bundle.name }))
      : [];

  if (
    workspaceState.status !== "available" ||
    connectionState?.requestedClient === null ||
    connectionState === null
  ) {
    return (
      <ConsentShell>
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">
          Authorization is unavailable
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Return to your MCP client and try again in a moment.
        </p>
      </ConsentShell>
    );
  }

  return (
    <ConsentShell>
      <McpClientMark clientName={connectionState.requestedClient.clientName} />
      <p className="mt-7 text-xs font-medium tracking-[0.16em] text-primary uppercase">
        MCP authorization
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
        Connect {connectionState.requestedClient.clientName}
      </h1>
      <dl className="mt-7 divide-y border-y text-sm">
        <div className="flex items-center justify-between gap-5 py-4">
          <dt className="text-muted-foreground">Client</dt>
          <dd className="font-medium">
            {connectionState.requestedClient.clientName}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-5 py-4">
          <dt className="text-muted-foreground">Workspace</dt>
          <dd className="font-medium">{workspaceState.workspace.name}</dd>
        </div>
      </dl>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">
        This client can use the integrations and MCP tools currently available
        to your membership, optionally narrowed to one bundle below. You can
        change this later from Agent Setup or Account.
      </p>
      <ConsentForm
        bundles={bundles}
        oauthQuery={returnPath.split("?")[1] ?? ""}
      />
    </ConsentShell>
  );
}

function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-[#fbfaf7] px-6 py-10 text-[#15130f]">
      <section className="m-auto w-full max-w-md border bg-background p-7 shadow-sm sm:p-9">
        {children}
      </section>
    </main>
  );
}
