import {
  CaretDownIcon,
  KeyIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";

import {
  CreateTokenForm,
  OAuthClientSetupTabs,
  RevokeTokenButton,
  TokenClientSetupGuide,
} from "@/app/(workspace)/agent-setup/agent-setup-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { McpConnectionList } from "@/components/mcp/connection-list";
import { WorkspacePage } from "@/components/workspace-page";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceStatus } from "@/components/workspace-status";
import { getBundleListState } from "@/lib/server/integration-bundle";
import {
  getMcpAccessState,
  getPublicMcpEndpoint,
} from "@/lib/server/mcp-access";
import { getMcpConnections } from "@/lib/server/mcp-connections";
import type { McpToken } from "@/lib/validation/mcp-access";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function TokenTable({
  showCreator = false,
  tokens,
}: {
  showCreator?: boolean;
  tokens: readonly McpToken[];
}) {
  return (
    <>
      <div className="divide-y border md:hidden">
        {tokens.map((token) => (
          <article className="space-y-4 p-4" key={token.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{token.name}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {token.prefix}••••••••
                </p>
              </div>
              <WorkspaceStatus
                tone={token.status === "active" ? "ready" : "disconnected"}
              >
                {token.status}
              </WorkspaceStatus>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              {showCreator ? (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Created by</dt>
                  <dd className="mt-1 truncate font-medium">
                    {token.creator.name} · {token.creator.email}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Bundle</dt>
                <dd className="mt-1 font-medium">
                  {token.bundle?.name ?? "All providers"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last used</dt>
                <dd className="mt-1 font-medium">
                  {token.lastUsedAt === null
                    ? "Never"
                    : formatDate(token.lastUsedAt)}
                </dd>
              </div>
            </dl>
            {token.status === "active" && token.permissions.canRevoke ? (
              <div className="flex justify-end">
                <RevokeTokenButton name={token.name} tokenId={token.id} />
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              {showCreator ? <TableHead>Created by</TableHead> : null}
              <TableHead>Bundle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((token) => (
              <TableRow key={token.id}>
                <TableCell>
                  <p className="font-medium">{token.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {token.prefix}••••••••
                  </p>
                </TableCell>
                {showCreator ? (
                  <TableCell>
                    <p className="font-medium">{token.creator.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {token.creator.email}
                    </p>
                  </TableCell>
                ) : null}
                <TableCell className="text-muted-foreground">
                  {token.bundle?.name ?? "All providers"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={token.status === "active" ? "default" : "outline"}
                  >
                    {token.status}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <time dateTime={token.createdAt}>
                    {formatDate(token.createdAt)}
                  </time>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {token.lastUsedAt === null ? (
                    "Never"
                  ) : (
                    <time dateTime={token.lastUsedAt}>
                      {formatDate(token.lastUsedAt)}
                    </time>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {token.status === "active" && token.permissions.canRevoke ? (
                    <RevokeTokenButton name={token.name} tokenId={token.id} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function NoTokens({ workspace = false }: { workspace?: boolean }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <KeyIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          {workspace ? "No other member tokens" : "No personal tokens"}
        </EmptyTitle>
        <EmptyDescription>
          {workspace
            ? "Tokens created by other workspace members will appear here."
            : "You do not need a token when your MCP client supports OAuth."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export default async function AgentSetupPage() {
  const [state, bundleState, connectionState] = await Promise.all([
    getMcpAccessState(),
    getBundleListState(),
    getMcpConnections(),
  ]);

  if (state.status === "anonymous" || connectionState.status === "anonymous")
    redirect("/sign-in");
  if (state.status === "without-workspace") redirect("/onboarding");

  const bundles =
    bundleState.status === "available"
      ? bundleState.data.map((bundle) => ({ id: bundle.id, name: bundle.name }))
      : [];

  if (state.status === "unavailable") {
    return (
      <WorkspacePage>
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Agent setup unavailable</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </WorkspacePage>
    );
  }

  const endpoint = getPublicMcpEndpoint();
  const personalTokens = state.data.tokens.filter(
    (token) => token.isCurrentMember,
  );
  const workspaceTokens = state.data.tokens.filter(
    (token) => !token.isCurrentMember,
  );

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        description="Register one Streamable HTTP endpoint, approve access in your browser, and let your MCP client keep the connection signed in."
        title="Agent Setup"
      />

      <section className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Connect a client</CardTitle>
            <CardDescription>
              Choose your client and register the workspace endpoint. Browser
              authorization keeps supported clients signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OAuthClientSetupTabs endpoint={endpoint} />
          </CardContent>
        </Card>
      </section>

      <section className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Connected clients</CardTitle>
            <CardDescription>
              Review personal authorizations, limit them to a bundle, or revoke
              access immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {connectionState.status !== "available" ? (
              <p className="text-sm text-muted-foreground">
                {connectionState.status === "unavailable"
                  ? connectionState.message
                  : "No connected clients were found. Connect a client to get started."}
              </p>
            ) : (
              <McpConnectionList
                bundles={bundles}
                connections={connectionState.data.connections}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <details className="group mt-10 border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
          <div>
            Legacy access tokens
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              For headless scripts and clients without OAuth
            </span>
          </div>
          <CaretDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            weight="bold"
          />
        </summary>
        <div className="space-y-8 border-t p-6 pt-0">
          <section>
            <div className="mt-5">
              <h2 className="text-base font-semibold">Create a token</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Choose a descriptive name and optionally limit access to one
                bundle.
              </p>
            </div>
            <div className="mt-5">
              <CreateTokenForm bundles={bundles} />
            </div>
          </section>

          <section className="border-t pt-7">
            <h2 className="text-base font-semibold">
              Set up a client with a token
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Keep the token out of client configuration files by referencing it
              securely.
            </p>
            <div className="mt-5">
              <TokenClientSetupGuide endpoint={endpoint} />
            </div>
          </section>

          <section className="border-t pt-7">
            <h2 className="text-base font-semibold">Your tokens</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Review or revoke the tokens created by your account.
            </p>
            <div className="mt-5">
              {personalTokens.length === 0 ? (
                <NoTokens />
              ) : (
                <TokenTable tokens={personalTokens} />
              )}
            </div>
          </section>

          {state.data.role === "owner" ? (
            <section className="border-t pt-7">
              <h2 className="text-base font-semibold">Workspace token audit</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Owners can audit and revoke other members&apos; tokens, but can
                never recover their values.
              </p>
              <div className="mt-5">
                {workspaceTokens.length === 0 ? (
                  <NoTokens workspace />
                ) : (
                  <TokenTable showCreator tokens={workspaceTokens} />
                )}
              </div>
            </section>
          ) : null}
        </div>
      </details>
    </WorkspacePage>
  );
}
