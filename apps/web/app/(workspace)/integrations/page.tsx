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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
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

function capabilityLabel(value: string): string {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
    <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12">
      <WorkspacePageHeader
        description="Connect and manage the tools that provide context to this workspace."
        title="Integrations"
      />

      {state.status !== "available" ? (
        <Alert className="mt-10" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Integrations unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load the provider catalogue. Refresh to try again.
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
                  <div className="flex items-start gap-4">
                    <ProviderMark
                      displayName={integration.displayName}
                      provider={integration.provider}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-xl">
                          {integration.displayName}
                        </CardTitle>
                        <Badge
                          variant={
                            integration.attention === null
                              ? "default"
                              : "destructive"
                          }
                        >
                          {statusLabel(integration)}
                        </Badge>
                      </div>
                      <CardDescription className="mt-2 line-clamp-2">
                        {integration.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col">
                  <div className="flex flex-wrap gap-1.5">
                    {integration.capabilities.map((capability) => (
                      <Badge key={capability} variant="secondary">
                        {capabilityLabel(capability)}
                      </Badge>
                    ))}
                  </div>

                  {hasAnyPipelineStep ? (
                    <div className="mt-5 divide-y divide-border border-y border-border">
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
                    <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-2 border-y border-dashed border-border py-8 text-center">
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

                  <div className="mt-6 flex items-center justify-between gap-4">
                    <span className="font-mono text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                      {hasNotificationChannels
                        ? "Notification relay"
                        : `${String(integration.installation?.enabledMcpToolCount ?? 0)} tools`}
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
                <div className="flex items-start gap-4">
                  <ProviderMark
                    displayName="GitHub"
                    provider="github"
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-xl">GitHub</CardTitle>
                      <Badge variant="secondary">Not configured</Badge>
                    </div>
                    <CardDescription className="mt-2 line-clamp-2">
                      Bring allowlisted GitHub repositories, code, issues, and
                      pull requests into your context layer.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["context", "Context"],
                    ["user-accounts", "User Accounts"],
                    ["scopes", "Scopes"],
                  ].map(([capability, label]) => (
                    <Badge key={capability} variant="secondary">
                      {label}
                    </Badge>
                  ))}
                </div>

                <div className="mt-5 divide-y divide-border border-y border-border">
                  <PipelineStep complete={false} label="Your account" />
                  <PipelineStep complete={false} label="Workspace resource" />
                  <PipelineStep complete={false} label="Allowed scopes" />
                  <PipelineStep complete={false} label="MCP tools" />
                </div>

                <div className="mt-6 flex items-center justify-between gap-4">
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
    </main>
  );
}
