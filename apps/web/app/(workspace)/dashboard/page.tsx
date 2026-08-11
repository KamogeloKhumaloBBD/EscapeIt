import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockCounterClockwiseIcon,
  PlugsConnectedIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProviderMark } from "@/components/integrations/provider-mark";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
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
import { Progress } from "@/components/ui/progress";
import { getIntegrationsState } from "@/lib/server/integration";
import { getWorkspaceOverviewState } from "@/lib/server/workspace";
import type { IntegrationSummary } from "@/lib/validation/integration";

function formatActivityTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(integration: IntegrationSummary): string {
  if (integration.installation === null) return "Not connected";
  if (integration.installation.status === "error") return "Needs attention";
  if (integration.currentAccount?.status !== "connected")
    return "Account required";
  if (integration.installation.resource === null) return "Site required";
  if (integration.installation.selectedScopeCount === 0)
    return "Access required";
  return "Ready";
}

export default async function DashboardPage() {
  const [workspaceState, integrationsState] = await Promise.all([
    getWorkspaceOverviewState(),
    getIntegrationsState(),
  ]);

  if (workspaceState.status === "anonymous") redirect("/sign-in");
  if (workspaceState.status === "without-workspace") redirect("/onboarding");

  if (
    workspaceState.status === "unavailable" ||
    integrationsState.status === "unavailable"
  ) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-10">
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Workspace unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t reach the API. Refresh the page to try again.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (integrationsState.status === "anonymous") redirect("/sign-in");

  const overview = workspaceState.overview;
  const integrations =
    integrationsState.status === "available" ? integrationsState.data : [];
  const jira = integrations.find(
    (integration) => integration.provider === "jira",
  );
  const setupSteps =
    jira === undefined
      ? []
      : [
          { complete: true, label: "Workspace created" },
          {
            complete: jira.currentAccount?.status === "connected",
            label: "Connect your Atlassian account",
          },
          {
            complete:
              jira.installation?.status === "connected" &&
              jira.installation.resource !== null,
            label: "Select the workspace Jira site",
          },
          {
            complete: (jira.installation?.selectedScopeCount ?? 0) > 0,
            label: "Choose allowed Jira projects",
          },
        ];
  const completedSteps = setupSteps.filter((step) => step.complete).length;
  const setupComplete =
    setupSteps.length > 0 && completedSteps === setupSteps.length;
  const attention = integrations.filter(
    (integration) => integration.attention !== null,
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12">
      <WorkspacePageHeader
        action={
          jira !== undefined && jira.nextStep !== "ready" ? (
            <Button asChild>
              <Link href="/integrations/jira">
                {jira.nextStep === "connect_provider"
                  ? "Connect Jira"
                  : "Continue setup"}
                <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          ) : undefined
        }
        description="Your connected tools, governed context, and workspace activity in one place."
        eyebrow={`${overview.role} workspace`}
        title={overview.name}
      />

      <section
        aria-label="Workspace summary"
        className="mt-10 overflow-hidden border border-border bg-card"
      >
        <div className="grid sm:grid-cols-3">
          {[
            ["Members", overview.memberCount],
            ["Connected integrations", overview.connectedIntegrationCount],
            ["Active MCP tokens", overview.activeMcpTokenCount],
          ].map(([label, value], index) => (
            <div
              className={`relative px-6 py-5 ${index > 0 ? "border-t sm:border-l sm:border-t-0" : ""}`}
              key={label}
            >
              <div className="absolute left-6 top-0 h-px w-10 bg-primary sm:left-0 sm:top-6 sm:h-10 sm:w-px" />
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 font-mono text-3xl font-medium tracking-[-0.04em] tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {attention.length > 0 ? (
        <Alert className="mt-8" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Attention required</AlertTitle>
          <AlertDescription>
            One or more integrations need to be reconnected or validated.
          </AlertDescription>
        </Alert>
      ) : null}

      {!setupComplete && setupSteps.length > 0 ? (
        <Card className="mt-10 max-w-4xl">
          <CardHeader>
            <CardTitle id="setup-heading">
              Build your first context source
            </CardTitle>
            <CardDescription>
              Complete the Jira setup to make workspace context available.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">
                {completedSteps}/{setupSteps.length}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Progress
              aria-labelledby="setup-heading"
              value={(completedSteps / setupSteps.length) * 100}
            />
            <div className="relative mt-7">
              <div className="flow-rail absolute bottom-5 left-[1.18rem] top-5 w-px" />
              <ItemGroup className="relative gap-3">
                {setupSteps.map((step, index) => (
                  <Item
                    className="bg-card"
                    key={step.label}
                    size="sm"
                    variant="outline"
                  >
                    <ItemMedia
                      className="z-10 grid size-8 place-items-center border border-border bg-card"
                      variant="icon"
                    >
                      {step.complete ? (
                        <CheckCircleIcon
                          aria-hidden="true"
                          className="text-emerald-600"
                          weight="fill"
                        />
                      ) : (
                        <CircleIcon
                          aria-hidden="true"
                          className="text-muted-foreground"
                        />
                      )}
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle
                        className={
                          step.complete ? "text-muted-foreground" : undefined
                        }
                      >
                        {step.label}
                      </ItemTitle>
                      <ItemDescription>
                        {step.complete
                          ? "Complete"
                          : index === completedSteps
                            ? "Your next step"
                            : "Waiting for the previous step"}
                      </ItemDescription>
                    </ItemContent>
                    {!step.complete && index === completedSteps ? (
                      <ItemActions>
                        <Badge>Next</Badge>
                      </ItemActions>
                    ) : null}
                  </Item>
                ))}
              </ItemGroup>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="sources-heading" className="mt-12">
        <Card>
          <CardHeader>
            <CardTitle id="sources-heading">Context sources</CardTitle>
            <CardDescription>
              Provider installations and account access for this workspace.
            </CardDescription>
            <CardAction>
              <Button asChild size="sm" variant="outline">
                <Link href="/integrations">View integrations</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {integrations.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PlugsConnectedIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No providers available</EmptyTitle>
                  <EmptyDescription>
                    No integration providers are configured for this deployment.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup className="gap-0">
                {integrations.map((integration, index) => (
                  <div key={integration.provider}>
                    {index > 0 ? <ItemSeparator /> : null}
                    <Item asChild className="border-0 py-4">
                      <Link href={`/integrations/${integration.provider}`}>
                        <ItemMedia>
                          <ProviderMark
                            displayName={integration.displayName}
                            provider={integration.provider}
                            size="md"
                          />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>
                            {integration.displayName}
                            <Badge
                              variant={
                                integration.attention === null
                                  ? "secondary"
                                  : "destructive"
                              }
                            >
                              {statusLabel(integration)}
                            </Badge>
                          </ItemTitle>
                          <ItemDescription>
                            {integration.installation?.resource?.name ??
                              integration.description}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <span className="text-xs text-muted-foreground">
                            {integration.installation?.selectedScopeCount ?? 0}{" "}
                            projects
                          </span>
                          <ArrowRightIcon aria-hidden="true" />
                        </ItemActions>
                      </Link>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="activity-heading" className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle id="activity-heading">Recent activity</CardTitle>
            <CardDescription>
              The latest workspace configuration events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recentActivity.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ClockCounterClockwiseIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No activity yet</EmptyTitle>
                  <EmptyDescription>
                    Workspace changes will appear here as they happen.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup className="relative gap-0">
                <div className="absolute bottom-7 left-[1.45rem] top-7 w-px bg-border" />
                {overview.recentActivity.map((event, index) => (
                  <div key={event.id}>
                    {index > 0 ? <ItemSeparator /> : null}
                    <Item className="border-0 py-4">
                      <ItemMedia className="z-10">
                        <span className="grid size-3 place-items-center rounded-full border-2 border-card bg-primary" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{event.summary}</ItemTitle>
                        <ItemDescription>
                          <span className="capitalize">{event.category}</span>
                          {" · "}
                          {event.status.replaceAll("_", " ")}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <time
                          className="font-mono text-xs tabular-nums text-muted-foreground"
                          dateTime={event.occurredAt}
                        >
                          {formatActivityTime(event.occurredAt)}
                        </time>
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
