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
    <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-10 lg:px-10 lg:pt-14">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="secondary">{overview.role} workspace</Badge>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
            {overview.name}
          </h1>
          <p className="mt-3 text-muted-foreground">
            Your connected tools and context, in one place.
          </p>
        </div>
        {jira !== undefined && jira.nextStep !== "ready" ? (
          <Button asChild>
            <Link href="/integrations/jira">
              {jira.nextStep === "connect_provider"
                ? "Connect Jira"
                : "Continue setup"}
              <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>
        ) : null}
      </div>

      <section
        aria-label="Workspace summary"
        className="mt-10 grid gap-4 sm:grid-cols-3"
      >
        {[
          ["Members", overview.memberCount],
          ["Connected integrations", overview.connectedIntegrationCount],
          ["Active MCP tokens", overview.activeMcpTokenCount],
        ].map(([label, value]) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl tracking-tight normal-case">
                {value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
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
        <Card className="mt-10 max-w-3xl">
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
            <ItemGroup className="mt-6 gap-1">
              {setupSteps.map((step) => (
                <Item key={step.label} size="sm" variant="muted">
                  <ItemMedia variant="icon">
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
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
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
                    <Item asChild>
                      <Link href={`/integrations/${integration.provider}`}>
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
              <ItemGroup className="gap-0">
                {overview.recentActivity.map((event, index) => (
                  <div key={event.id}>
                    {index > 0 ? <ItemSeparator /> : null}
                    <Item>
                      <ItemContent>
                        <ItemTitle>{event.summary}</ItemTitle>
                        <ItemDescription>
                          {event.category} · {event.status.replaceAll("_", " ")}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <time
                          className="text-xs text-muted-foreground"
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
