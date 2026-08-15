import {
  CheckCircleIcon,
  LinkIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { notFound, redirect } from "next/navigation";

import {
  ArchiveServerDialog,
  BearerForm,
  DisconnectAccountDialog,
  RenameForm,
  SimpleMutationForm,
  ToolApprovalForm,
} from "./server-forms";
import { customMcpStatusLabel, customMcpStatusTone } from "../presentation";
import { CustomMcpMark } from "@/components/integrations/custom-mcp-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { WorkspacePage } from "@/components/workspace-page";
import { WorkspaceStatus } from "@/components/workspace-status";
import { getCustomMcpServerState } from "@/lib/server/custom-mcp";

function validationLabel(value: string | null): string {
  if (value === null) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export default async function CustomMcpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<{ oauth?: string }>;
}) {
  const { serverId } = await params;
  const { oauth } = await searchParams;
  const state = await getCustomMcpServerState(serverId);
  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "not-found") notFound();
  if (state.status !== "available") {
    return (
      <WorkspacePage width="focused">
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Custom MCP unavailable</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </WorkspacePage>
    );
  }

  const server = state.data;
  const connected =
    server.authenticationKind === "none" ||
    server.currentAccount?.status === "connected";
  const enabledTools = server.tools.filter(
    (tool) => tool.enabled && tool.available,
  );
  const validationDate =
    server.currentAccount?.lastValidatedAt ?? server.lastValidatedAt;
  const accountStatus =
    server.authenticationKind === "none"
      ? "Not required"
      : server.currentAccount?.status === "connected"
        ? "Connected"
        : "Not connected";
  const sections = [
    { href: "#personal-account", label: "Your connection" },
    { href: "#mcp-tools", label: "MCP tools" },
    ...(server.permissions.canManageServer
      ? [{ href: "#workspace-settings", label: "Workspace settings" }]
      : []),
  ];

  return (
    <WorkspacePage width="focused">
      {oauth === "connected" ? (
        <Alert className="mb-8">
          <CheckCircleIcon aria-hidden="true" />
          <AlertTitle>OAuth connected</AlertTitle>
          <AlertDescription>
            Your personal account is ready. The workspace owner can now review
            the tool catalogue.
          </AlertDescription>
        </Alert>
      ) : oauth === "failed" ? (
        <Alert className="mb-8" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>OAuth connection failed</AlertTitle>
          <AlertDescription>
            Start the connection again, or use a personal bearer token if the
            server supports one.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="relative overflow-hidden border border-border bg-card p-6 sm:p-8">
        <div className="absolute -right-24 -top-32 size-80 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <CustomMcpMark size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  {server.name}
                </h1>
                <WorkspaceStatus tone={customMcpStatusTone(server)}>
                  {customMcpStatusLabel(server)}
                </WorkspaceStatus>
              </div>
              <p
                className="mt-3 max-w-2xl break-all font-mono text-sm leading-6 text-muted-foreground"
                title={server.endpointUrl}
              >
                {server.endpointUrl}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {connected ? (
              <SimpleMutationForm
                intent="validate"
                label="Validate connection"
                pendingLabel="Validating…"
                serverId={server.id}
              />
            ) : server.authenticationKind === "oauth" &&
              server.permissions.canConnectAccount ? (
              <Button asChild>
                <a
                  href={`/api/custom-mcp-servers/${encodeURIComponent(server.id)}/oauth/start`}
                >
                  <LinkIcon aria-hidden="true" data-icon="inline-start" />
                  Connect with OAuth
                </a>
              </Button>
            ) : server.permissions.canConnectAccount ? (
              <Button asChild>
                <a href="#personal-account">Connect account</a>
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="relative mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "Authentication",
              server.authenticationKind === "none"
                ? "Public"
                : server.authenticationKind.toUpperCase(),
            ],
            ["Your account", accountStatus],
            ["Enabled MCP tools", String(enabledTools.length)],
            ["Last validated", validationLabel(validationDate)],
          ].map(([label, value]) => (
            <div className="min-w-0 bg-card px-4 py-3.5" key={label}>
              <dt className="text-[0.6875rem] font-medium text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {server.status === "error" ? (
        <Alert className="mt-8" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Attention required</AlertTitle>
          <AlertDescription>
            Validate your connection or reconnect before using this server.
          </AlertDescription>
        </Alert>
      ) : null}

      <nav
        aria-label="Custom MCP settings"
        className="sticky top-16 z-10 mt-8 flex gap-1 overflow-x-auto border border-border bg-background/95 p-1.5 backdrop-blur"
      >
        {sections.map((section) => (
          <Button asChild key={section.href} size="sm" variant="ghost">
            <a className="shrink-0" href={section.href}>
              {section.label}
            </a>
          </Button>
        ))}
      </nav>

      <div className="mt-8 space-y-6">
        <Card className="scroll-mt-36" id="personal-account">
          <CardHeader>
            <CardTitle>Your connection</CardTitle>
            <CardDescription>
              {server.authenticationKind === "none"
                ? "This public server is available to every workspace member once its tools are approved."
                : "Requests use your personal upstream credentials, encrypted for your membership and never shared with other members."}
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">{accountStatus}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-5">
            {server.authenticationKind === "none" ? (
              <Item variant="muted">
                <ItemMedia variant="icon">
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="text-emerald-600"
                    weight="fill"
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Public server</ItemTitle>
                  <ItemDescription>
                    No personal account or credential is required.
                  </ItemDescription>
                </ItemContent>
              </Item>
            ) : connected ? (
              <Item variant="muted">
                <ItemMedia variant="icon">
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="text-emerald-600"
                    weight="fill"
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Connected personal account</ItemTitle>
                  <ItemDescription>
                    Connected with{" "}
                    {server.currentAccount?.authMethod.toUpperCase() ??
                      "your credentials"}
                    .
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <DisconnectAccountDialog serverId={server.id} />
                </ItemActions>
              </Item>
            ) : !server.permissions.canConnectAccount ? (
              <Alert>
                <AlertTitle>Waiting for the workspace owner</AlertTitle>
                <AlertDescription>
                  The owner must finish the initial connection and tool review
                  before members can connect their accounts.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {server.authenticationKind === "oauth" ? (
                  <Item variant="muted">
                    <ItemMedia variant="icon">
                      <LinkIcon aria-hidden="true" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Connect with OAuth</ItemTitle>
                      <ItemDescription>
                        Authorize the upstream identity this server should use
                        for your requests.
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="w-full sm:ml-auto sm:w-auto">
                      <Button asChild className="w-full sm:w-auto">
                        <a
                          href={`/api/custom-mcp-servers/${encodeURIComponent(server.id)}/oauth/start`}
                        >
                          <LinkIcon
                            aria-hidden="true"
                            data-icon="inline-start"
                          />
                          Connect with OAuth
                        </a>
                      </Button>
                    </ItemActions>
                  </Item>
                ) : null}
                <div
                  className={
                    server.authenticationKind === "oauth"
                      ? "border border-dashed border-border p-4"
                      : undefined
                  }
                >
                  {server.authenticationKind === "oauth" ? (
                    <div className="mb-4">
                      <p className="text-sm font-medium">
                        Or use a personal bearer token
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Use this only when the server supports bearer access.
                      </p>
                    </div>
                  ) : null}
                  <BearerForm
                    secondary={server.authenticationKind === "oauth"}
                    serverId={server.id}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="scroll-mt-36" id="mcp-tools">
          <CardHeader>
            <CardTitle>MCP tools</CardTitle>
            <CardDescription>
              Only enabled tools are shown to agents. Tools without an explicit
              read-only annotation may make changes upstream.
            </CardDescription>
            <CardAction className="flex items-center gap-2">
              <Badge variant="secondary">{enabledTools.length} enabled</Badge>
              {connected && server.permissions.canManageTools ? (
                <SimpleMutationForm
                  intent="refresh"
                  label="Refresh catalogue"
                  pendingLabel="Refreshing…"
                  serverId={server.id}
                />
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent>
            {!connected ? (
              <Alert>
                <AlertTitle>Connection required</AlertTitle>
                <AlertDescription>
                  Connect your account before reviewing MCP tools.
                </AlertDescription>
              </Alert>
            ) : server.permissions.canManageTools && server.tools.length > 0 ? (
              <ToolApprovalForm serverId={server.id} tools={server.tools} />
            ) : server.permissions.canManageTools ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ShieldCheckIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No tools discovered</EmptyTitle>
                  <EmptyDescription>
                    Refresh the catalogue after connecting to discover this
                    server&apos;s available tools.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : enabledTools.length > 0 ? (
              <ItemGroup className="gap-0">
                {enabledTools.map((tool, index) => (
                  <div key={tool.id}>
                    {index > 0 ? <ItemSeparator /> : null}
                    <Item>
                      <ItemMedia variant="icon">
                        <ShieldCheckIcon aria-hidden="true" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>
                          {tool.title}
                          <Badge variant="secondary">
                            {tool.kind === "read" ? "Read-only" : "May write"}
                          </Badge>
                        </ItemTitle>
                        <ItemDescription>{tool.description}</ItemDescription>
                      </ItemContent>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ShieldCheckIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No MCP tools enabled</EmptyTitle>
                  <EmptyDescription>
                    The workspace owner has not enabled any tools from this
                    server.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        {server.permissions.canManageServer ? (
          <Card className="scroll-mt-36" id="workspace-settings">
            <CardHeader>
              <CardTitle>Workspace settings</CardTitle>
              <CardDescription>
                The endpoint and generated slug are immutable. Archive and
                reinstall the server to change its endpoint.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ItemGroup className="gap-0">
                <Item>
                  <ItemContent>
                    <ItemTitle>Endpoint</ItemTitle>
                    <ItemDescription className="break-all font-mono text-xs">
                      {server.endpointUrl}
                    </ItemDescription>
                  </ItemContent>
                </Item>
                <ItemSeparator />
                <Item>
                  <ItemContent>
                    <ItemTitle>Tool namespace</ItemTitle>
                    <ItemDescription className="font-mono text-xs">
                      custom_{server.slug}_*
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </ItemGroup>
              <RenameForm name={server.name} serverId={server.id} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      {server.permissions.canManageServer ? (
        <section className="mt-10 border border-destructive/25 bg-destructive/5 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-sm font-semibold">Archive server</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Remove workspace and bundle access, and permanently clear every
              member&apos;s stored credential.
            </p>
          </div>
          <div className="mt-4 shrink-0 sm:mt-0">
            <ArchiveServerDialog name={server.name} serverId={server.id} />
          </div>
        </section>
      ) : null}
    </WorkspacePage>
  );
}
