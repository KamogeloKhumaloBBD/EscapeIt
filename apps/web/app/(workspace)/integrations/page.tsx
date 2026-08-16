import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleIcon,
  PlugsConnectedIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomMcpInstallDialog } from "@/app/(workspace)/integrations/custom/install-form";
import {
  customMcpActionLabel,
  customMcpStatusLabel,
  customMcpStatusTone,
} from "@/app/(workspace)/integrations/custom/presentation";
import { IntegrationCatalogTabs } from "@/app/(workspace)/integrations/integration-catalog-tabs";
import { CustomMcpMark } from "@/components/integrations/custom-mcp-mark";
import { ProviderMark } from "@/components/integrations/provider-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspacePage } from "@/components/workspace-page";
import {
  WorkspaceStatus,
  type WorkspaceStatusTone,
} from "@/components/workspace-status";
import { getIntegrationsState } from "@/lib/server/integration";
import { getCustomMcpServersState } from "@/lib/server/custom-mcp";
import { getNotificationChannelsState } from "@/lib/server/notification";
import { getCurrentWorkspaceState } from "@/lib/server/workspace";
import type { IntegrationSummary } from "@/lib/validation/integration";

function actionLabel(integration: IntegrationSummary): string {
  if (integration.currentAccount?.status === "error") return "Reconnect";
  if (integration.nextStep === "connect_provider") return "Connect";
  if (integration.nextStep === "ready") return "Manage";
  if (integration.nextStep === "wait_for_owner") return "View setup";
  return "Continue setup";
}

function statusLabel(integration: IntegrationSummary): string {
  if (integration.attention !== null) return "Needs attention";
  if (integration.nextStep === "ready") return "Ready";
  if (integration.installation === null) return "Not connected";
  return "Setup required";
}

function statusTone(integration: IntegrationSummary): WorkspaceStatusTone {
  if (integration.attention !== null) return "attention";
  if (integration.nextStep === "ready") return "ready";
  if (integration.installation === null) return "disconnected";
  return "setup";
}

function PipelineStep({
  complete,
  label,
}: {
  complete: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {complete ? (
          <CheckCircleIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-emerald-600"
            weight="fill"
          />
        ) : (
          <CircleIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground/55"
          />
        )}
        <span className="truncate text-xs font-medium">{label}</span>
      </div>
      <span className="font-mono text-[0.625rem] tracking-wide text-muted-foreground uppercase">
        {complete ? "Ready" : "Pending"}
      </span>
    </div>
  );
}

export default async function IntegrationsPage() {
  const [state, customState, workspaceState, channelsState] = await Promise.all(
    [
      getIntegrationsState(),
      getCustomMcpServersState(),
      getCurrentWorkspaceState(),
      getNotificationChannelsState(),
    ],
  );

  if (
    state.status === "anonymous" ||
    customState.status === "anonymous" ||
    channelsState.status === "anonymous"
  )
    redirect("/sign-in");

  const integrations = state.status === "available" ? state.data : [];
  const notificationChannels =
    channelsState.status === "available" ? channelsState.data : [];
  const hasGitHub = integrations.some(
    (integration) => integration.provider === "github",
  );
  const canInstallCustomMcp =
    workspaceState.status === "available" &&
    workspaceState.workspace.role === "owner";

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        description="Connect and manage the tools that provide context to this workspace."
        title="Integrations"
      />

      <IntegrationCatalogTabs
        platform={
          state.status !== "available" ? (
            <Alert variant="destructive">
              <WarningCircleIcon aria-hidden="true" />
              <AlertTitle>Integrations unavailable</AlertTitle>
              <AlertDescription>
                {state.status === "unavailable"
                  ? state.message
                  : "The provider catalogue was not found. Refresh the page to try again."}
              </AlertDescription>
            </Alert>
          ) : (
            <section
              aria-label="Available integrations"
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {integrations.map((integration) => {
                const hasAccount =
                  integration.capabilities.includes("user-accounts");
                const hasScopes = integration.capabilities.includes("scopes");
                const hasMcpTools =
                  integration.capabilities.includes("context");
                const hasNotificationChannels =
                  integration.capabilities.includes("notification-channels");
                const connectedChannels = notificationChannels.filter(
                  (channel) =>
                    channel.provider === integration.provider &&
                    channel.status === "connected",
                );
                const visibleConnectedChannels = connectedChannels.slice(0, 3);
                const hiddenConnectedChannelCount =
                  connectedChannels.length - visibleConnectedChannels.length;
                const accountConnected =
                  integration.currentAccount?.status === "connected";
                const resourceSelected =
                  integration.installation?.resource !== null &&
                  integration.installation?.resource !== undefined;
                const scopesSelected =
                  (integration.installation?.selectedScopeCount ?? 0) > 0;
                const toolsSelected =
                  (integration.installation?.enabledMcpToolCount ?? 0) > 0;
                const hasAnyPipelineStep =
                  hasAccount || hasScopes || hasMcpTools;

                return (
                  <Card
                    className="group h-full shadow-none transition-colors hover:border-primary/35 hover:bg-primary/[0.025]"
                    key={integration.provider}
                  >
                    <CardHeader className="border-b border-border pb-5">
                      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4">
                        <ProviderMark
                          displayName={integration.displayName}
                          provider={integration.provider}
                          size="md"
                        />
                        <CardTitle
                          className="min-w-0 truncate text-xl"
                          title={integration.displayName}
                        >
                          {integration.displayName}
                        </CardTitle>
                        <WorkspaceStatus
                          className="shrink-0 whitespace-nowrap"
                          tone={statusTone(integration)}
                        >
                          {statusLabel(integration)}
                        </WorkspaceStatus>
                      </div>
                      <CardDescription className="mt-3">
                        {integration.description}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-1 flex-col">
                      {hasAnyPipelineStep ? (
                        <div className="divide-y divide-border border-y border-border">
                          {hasAccount ? (
                            <PipelineStep
                              complete={accountConnected}
                              label="Your account"
                            />
                          ) : null}
                          {hasAccount ? (
                            <PipelineStep
                              complete={resourceSelected}
                              label="Workspace resource"
                            />
                          ) : null}
                          {hasScopes ? (
                            <PipelineStep
                              complete={scopesSelected}
                              label="Allowed scopes"
                            />
                          ) : null}
                          {hasMcpTools ? (
                            <PipelineStep
                              complete={toolsSelected}
                              label="MCP tools"
                            />
                          ) : null}
                        </div>
                      ) : hasNotificationChannels &&
                        connectedChannels.length > 0 ? (
                        <div className="divide-y divide-border border-y border-border">
                          {visibleConnectedChannels.map((channel) => (
                            <PipelineStep
                              complete
                              key={channel.id}
                              label={channel.name}
                            />
                          ))}
                          {hiddenConnectedChannelCount > 0 ? (
                            <div className="py-2.5 text-xs text-muted-foreground">
                              +{hiddenConnectedChannelCount} more connected{" "}
                              {hiddenConnectedChannelCount === 1
                                ? "channel"
                                : "channels"}
                            </div>
                          ) : null}
                        </div>
                      ) : hasNotificationChannels ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 border-y border-dashed border-border py-8 text-center">
                          <PlugsConnectedIcon
                            aria-hidden="true"
                            className="size-5 text-muted-foreground/55"
                          />
                          <p className="text-xs text-muted-foreground">
                            {integration.nextStep === "ready"
                              ? "Relaying notifications to connected channels."
                              : "Connect a channel to start relaying notifications."}
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-auto flex items-center justify-between gap-4 pt-6">
                        <span className="text-xs text-muted-foreground">
                          {hasNotificationChannels &&
                          connectedChannels.length > 0
                            ? `${String(connectedChannels.length)} connected ${connectedChannels.length === 1 ? "channel" : "channels"}`
                            : integration.nextStep === "ready"
                              ? "Configuration complete"
                              : "Next step available"}
                        </span>
                        <Button
                          asChild
                          variant={
                            integration.nextStep === "ready"
                              ? "outline"
                              : "default"
                          }
                        >
                          <Link href={`/integrations/${integration.provider}`}>
                            {actionLabel(integration)}
                            <ArrowRightIcon
                              aria-hidden="true"
                              data-icon="inline-end"
                            />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {hasGitHub ? null : (
                <Card className="h-full border-dashed shadow-none">
                  <CardHeader className="border-b border-border pb-5">
                    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4">
                      <ProviderMark
                        displayName="GitHub"
                        provider="github"
                        size="md"
                      />
                      <CardTitle
                        className="min-w-0 truncate text-xl"
                        title="GitHub"
                      >
                        GitHub
                      </CardTitle>
                      <WorkspaceStatus
                        className="shrink-0 whitespace-nowrap"
                        tone="disconnected"
                      >
                        Not configured
                      </WorkspaceStatus>
                    </div>
                    <CardDescription className="mt-3">
                      Bring allowlisted GitHub repositories, code, issues, and
                      pull requests into your context layer.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col">
                    <div className="divide-y divide-border border-y border-border">
                      <PipelineStep complete={false} label="Your account" />
                      <PipelineStep
                        complete={false}
                        label="Workspace resource"
                      />
                      <PipelineStep complete={false} label="Allowed scopes" />
                      <PipelineStep complete={false} label="MCP tools" />
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-4 pt-6">
                      <span className="font-mono text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                        GitHub App credentials required
                      </span>
                      <Button disabled>Configure API</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          )
        }
        custom={
          <section aria-labelledby="custom-mcp-heading">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold" id="custom-mcp-heading">
                  Custom MCP servers
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Add tools we do not offer yet while keeping approvals
                  workspace-governed and credentials personal.
                </p>
              </div>
              {canInstallCustomMcp &&
              customState.status === "available" &&
              customState.data.length > 0 ? (
                <CustomMcpInstallDialog />
              ) : null}
            </div>

            {customState.status === "available" ? (
              customState.data.length === 0 ? (
                <Empty className="min-h-72 border border-border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <PlugsConnectedIcon aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>No Custom MCP servers</EmptyTitle>
                    <EmptyDescription>
                      Install a remote server to add governed tools that are not
                      available through platform integrations.
                    </EmptyDescription>
                  </EmptyHeader>
                  {canInstallCustomMcp ? <CustomMcpInstallDialog /> : null}
                </Empty>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {customState.data.map((server) => {
                    const accountConnected =
                      server.authenticationKind === "none" ||
                      server.currentAccount?.status === "connected";
                    const enabledTools = server.tools.filter(
                      (tool) => tool.available && tool.enabled,
                    ).length;
                    return (
                      <Card
                        className="group h-full shadow-none transition-colors hover:border-primary/35 hover:bg-primary/[0.025]"
                        key={server.id}
                      >
                        <CardHeader className="border-b border-border pb-5">
                          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4">
                            <CustomMcpMark />
                            <CardTitle
                              className="min-w-0 truncate text-xl"
                              title={server.name}
                            >
                              {server.name}
                            </CardTitle>
                            <WorkspaceStatus
                              className="shrink-0 whitespace-nowrap"
                              tone={customMcpStatusTone(server)}
                            >
                              {customMcpStatusLabel(server)}
                            </WorkspaceStatus>
                          </div>
                          <CardDescription
                            className="mt-3 truncate font-mono text-xs"
                            title={server.endpointUrl}
                          >
                            {server.endpointUrl}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col">
                          <div className="divide-y divide-border border-y border-border">
                            <PipelineStep
                              complete={accountConnected}
                              label={
                                server.authenticationKind === "none"
                                  ? "Public connection"
                                  : "Your account"
                              }
                            />
                            <PipelineStep
                              complete={enabledTools > 0}
                              label="Approved tools"
                            />
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-4 pt-6">
                            <span className="text-xs text-muted-foreground">
                              {server.authenticationKind === "none"
                                ? "No authentication"
                                : `${server.authenticationKind.toUpperCase()} · personal credentials`}
                            </span>
                            <Button
                              asChild
                              variant={
                                server.nextStep === "ready"
                                  ? "outline"
                                  : "default"
                              }
                            >
                              <Link href={`/integrations/custom/${server.id}`}>
                                {customMcpActionLabel(server)}
                                <ArrowRightIcon
                                  aria-hidden="true"
                                  data-icon="inline-end"
                                />
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )
            ) : (
              <Alert variant="destructive">
                <WarningCircleIcon aria-hidden="true" />
                <AlertTitle>Custom MCP unavailable</AlertTitle>
                <AlertDescription>
                  {customState.status === "unavailable"
                    ? customState.message
                    : "Custom MCP servers were not found."}
                </AlertDescription>
              </Alert>
            )}
          </section>
        }
      />
    </WorkspacePage>
  );
}
