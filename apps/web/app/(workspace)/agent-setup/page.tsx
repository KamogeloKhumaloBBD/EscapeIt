import { KeyIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";

import {
  ClientSetupTabs,
  CreateTokenForm,
  EndpointField,
  RevokeTokenButton,
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
          {workspace ? "No other member tokens" : "No access tokens"}
        </EmptyTitle>
        <EmptyDescription>
          {workspace
            ? "Tokens created by other workspace members will appear here."
            : "Create a personal token to connect your first MCP client."}
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
    <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12">
      <WorkspacePageHeader
        description="Create a personal credential and connect coding agents to your workspace through one authenticated Streamable HTTP endpoint."
        eyebrow="MCP access"
        title="Agent Setup"
      />

      <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Personal access tokens</CardTitle>
              <CardDescription>
                Tokens act as you and use your membership and provider accounts.
                They do not expire automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateTokenForm />
            </CardContent>
            <CardContent className="border-t pt-6">
              {personalTokens.length === 0 ? (
                <NoTokens />
              ) : (
                <TokenTable tokens={personalTokens} />
              )}
            </CardContent>
          </Card>

          {state.data.role === "owner" ? (
            <Card>
              <CardHeader>
                <CardTitle>Workspace token access</CardTitle>
                <CardDescription>
                  Owners can audit and revoke tokens, but can never recover
                  their values.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {workspaceTokens.length === 0 ? (
                  <NoTokens workspace />
                ) : (
                  <TokenTable showCreator tokens={workspaceTokens} />
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Gateway endpoint</CardTitle>
              <CardDescription>
                Send the token as a bearer credential on every request.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EndpointField endpoint={endpoint} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connect a client</CardTitle>
              <CardDescription>
                Set <code>CONTEXT_LAYER_TOKEN</code> locally, then use the
                matching client configuration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientSetupTabs endpoint={endpoint} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
