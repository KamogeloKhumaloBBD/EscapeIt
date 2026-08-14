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
} from "@/app/(workspace)/agent-setup/agent-setup-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import {
  getMcpAccessState,
  getPublicMcpEndpoint,
} from "@/lib/server/mcp-access";
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Token</TableHead>
            {showCreator ? <TableHead>Created by</TableHead> : null}
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
  const state = await getMcpAccessState();

  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "without-workspace") redirect("/onboarding");

  if (state.status === "unavailable") {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-10">
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Agent setup unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load MCP access. Refresh to try again.
          </AlertDescription>
        </Alert>
      </main>
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
    <main className="mx-auto w-full max-w-7xl px-5 pt-9 pb-24 sm:px-7 lg:px-10 lg:pt-12">
      <WorkspacePageHeader
        description="Register one Streamable HTTP endpoint, approve access in your browser, and let your MCP client keep the connection signed in."
        eyebrow="MCP access"
        title="Agent Setup"
      />

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Connect a client</CardTitle>
          </CardHeader>
          <CardContent>
            <OAuthClientSetupTabs endpoint={endpoint} />
          </CardContent>
        </Card>
      </div>

      <details className="group mt-10 border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
          <div>
            Personal access tokens
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
              <CreateTokenForm />
            </div>
            <div className="mt-6 border-t pt-2">
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
    </main>
  );
}
