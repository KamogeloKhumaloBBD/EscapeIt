import {
  PlugsConnectedIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { getIntegrationsState } from "@/lib/server/integration";
import { getMemberListState } from "@/lib/server/member";
import {
  getCurrentWorkspaceState,
  getWorkspaceAnalyticsState,
} from "@/lib/server/workspace";

import { DashboardAnalytics } from "./dashboard-analytics";
import { DashboardFilters } from "./dashboard-filters";
import { DashboardTimeZone } from "./dashboard-time-zone";

function queryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const start = queryValue(parameters.start);
  const end = queryValue(parameters.end);
  const provider = queryValue(parameters.provider);
  const membershipId = queryValue(parameters.membershipId);
  const timeZone = queryValue(parameters.timeZone);

  if (timeZone === undefined) {
    return <DashboardTimeZone loading />;
  }

  const [workspaceState, integrationsState, analyticsState, memberListState] =
    await Promise.all([
      getCurrentWorkspaceState(),
      getIntegrationsState(),
      getWorkspaceAnalyticsState(start, end, provider, membershipId, timeZone),
      getMemberListState(),
    ]);

  if (
    workspaceState.status === "anonymous" ||
    integrationsState.status === "anonymous" ||
    analyticsState.status === "anonymous"
  ) {
    redirect("/sign-in");
  }
  if (
    workspaceState.status === "without-workspace" ||
    analyticsState.status === "without-workspace"
  ) {
    redirect("/onboarding");
  }

  if (workspaceState.status !== "available") {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-10">
        <DashboardTimeZone current={timeZone} />
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

  if (analyticsState.status === "invalid") {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12">
        <DashboardTimeZone current={timeZone} />
        <WorkspacePageHeader
          action={
            <Button asChild variant="outline">
              <Link
                href={`/dashboard?timeZone=${encodeURIComponent(timeZone)}`}
              >
                Reset to 30 days
              </Link>
            </Button>
          }
          description="Workspace tool usage, reliability, and recent activity."
          title={workspaceState.workspace.name}
        />
        <Alert className="mt-9" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Invalid analytics filters</AlertTitle>
          <AlertDescription>{analyticsState.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (
    analyticsState.status !== "available" ||
    integrationsState.status === "unavailable"
  ) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-10">
        <DashboardTimeZone current={timeZone} />
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load workspace analytics. Refresh the page to try
            again.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const integrations =
    integrationsState.status === "available" ? integrationsState.data : [];
  const attention = integrations.filter(
    (integration) => integration.attention !== null,
  );
  const readyIntegrations = integrations.filter(
    (integration) => integration.nextStep === "ready",
  );
  const nextIntegration = integrations.find(
    (integration) => integration.nextStep !== "ready",
  );
  const providerNames = Object.fromEntries(
    integrations.map((integration) => [
      integration.provider,
      integration.displayName,
    ]),
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12">
      <DashboardTimeZone current={timeZone} />
      <WorkspacePageHeader
        description="Workspace tool usage, reliability, and recent activity."
        title={workspaceState.workspace.name}
      />

      <DashboardFilters
        end={analyticsState.analytics.range.end}
        integrations={integrations.filter(
          (integration) => integration.installation !== null,
        )}
        {...(workspaceState.workspace.role === "owner" &&
        memberListState.status === "available"
          ? { members: memberListState.data.members }
          : {})}
        {...(membershipId === undefined
          ? {}
          : { selectedMembershipId: membershipId })}
        {...(provider === undefined ? {} : { selectedProvider: provider })}
        start={analyticsState.analytics.range.start}
      />

      {attention.length > 0 ? (
        <Alert className="mt-8" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Integration attention required</AlertTitle>
          <AlertDescription>
            {attention.length === 1
              ? attention[0]?.displayName
              : "Some integrations"}{" "}
            need to be reconnected or validated.{" "}
            <Link href="/integrations">Review integrations</Link>.
          </AlertDescription>
        </Alert>
      ) : readyIntegrations.length === 0 ? (
        <Alert className="mt-8">
          <PlugsConnectedIcon aria-hidden="true" />
          <AlertTitle>No integration is ready for tool calls</AlertTitle>
          <AlertDescription>
            Finish connecting a context source before usage data can appear.{" "}
            <Link
              href={
                nextIntegration === undefined
                  ? "/integrations"
                  : `/integrations/${nextIntegration.provider}`
              }
            >
              Continue setup
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <DashboardAnalytics
        analytics={analyticsState.analytics}
        providerNames={providerNames}
        rankingFilters={{
          end: analyticsState.analytics.range.end,
          ...(membershipId === undefined ? {} : { membershipId }),
          ...(provider === undefined ? {} : { provider }),
          start: analyticsState.analytics.range.start,
          timeZone: analyticsState.analytics.timeZone,
        }}
      />
    </main>
  );
}
