import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleIcon,
  PlugsConnectedIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";

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
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspacePage } from "@/components/workspace-page";
import {
  WorkspaceStatus,
  type WorkspaceStatusTone,
} from "@/components/workspace-status";
import { getIntegrationsState } from "@/lib/server/integration";
import type { IntegrationSummary } from "@/lib/validation/integration";

function actionLabel(nextStep: string): string {
  if (nextStep === "connect_provider") return "Connect";
  if (nextStep === "ready") return "Manage";
  if (nextStep === "wait_for_owner") return "View setup";
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
  const state = await getIntegrationsState();

  if (state.status === "anonymous") redirect("/sign-in");

  const integrations = state.status === "available" ? state.data : [];
  const hasGitHub = integrations.some(
    (integration) => integration.provider === "github",
  );

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        description="Connect and manage the tools that provide context to this workspace."
        title="Integrations"
      />

      {state.status !== "available" ? (
        <Alert className="mt-10" variant="destructive">
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
          className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {integrations.map((integration) => {
            const hasAccount =
              integration.capabilities.includes("user-accounts");
            const hasScopes = integration.capabilities.includes("scopes");
            const hasMcpTools = integration.capabilities.includes("context");
            const hasNotificationChannels = integration.capabilities.includes(
              "notification-channels",
            );
            const accountConnected =
              integration.currentAccount?.status === "connected";
            const resourceSelected =
              integration.installation?.resource !== null &&
              integration.installation?.resource !== undefined;
            const scopesSelected =
              (integration.installation?.selectedScopeCount ?? 0) > 0;
            const toolsSelected =
              (integration.installation?.enabledMcpToolCount ?? 0) > 0;
            const hasAnyPipelineStep = hasAccount || hasScopes || hasMcpTools;

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
                      {integration.nextStep === "ready"
                        ? "Configuration complete"
                        : "Next step available"}
                    </span>
                    <Button
                      asChild
                      variant={
                        integration.nextStep === "ready" ? "outline" : "default"
                      }
                    >
                      <Link href={`/integrations/${integration.provider}`}>
                        {actionLabel(integration.nextStep)}
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
                  Bring allowlisted GitHub repositories, code, issues, and pull
                  requests into your context layer.
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col">
                <div className="divide-y divide-border border-y border-border">
                  <PipelineStep complete={false} label="Your account" />
                  <PipelineStep complete={false} label="Workspace resource" />
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
      )}
    </WorkspacePage>
  );
}
