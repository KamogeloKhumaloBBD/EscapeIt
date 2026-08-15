import {
  PlugsConnectedIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";
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
import {
  dashboardTimeZoneCookieName,
  parseDashboardTimeZone,
} from "./time-zone-cookie";
import { SendDigestButton } from "./send-digest-button";

function queryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [parameters, cookieStore] = await Promise.all([
    searchParams,
    cookies(),
  ]);
  const start = queryValue(parameters.start);
  const end = queryValue(parameters.end);
  const provider = queryValue(parameters.provider);
  const membershipId = queryValue(parameters.membershipId);
  const timeZone = parseDashboardTimeZone(
    cookieStore.get(dashboardTimeZoneCookieName)?.value,
  );

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
      <WorkspacePage>
        <DashboardTimeZone current={timeZone} />
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Workspace unavailable</AlertTitle>
          <AlertDescription>{workspaceState.message}</AlertDescription>
        </Alert>
      </WorkspacePage>
    );
  }

  if (analyticsState.status === "invalid") {
    return (
      <WorkspacePage>
        <DashboardTimeZone current={timeZone} />
        <WorkspacePageHeader
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard">Reset to 30 days</Link>
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
      </WorkspacePage>
    );
  }

  if (
    analyticsState.status !== "available" ||
    integrationsState.status === "unavailable"
  ) {
    return (
      <WorkspacePage>
        <DashboardTimeZone current={timeZone} />
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription>
            {analyticsState.status === "unavailable"
              ? analyticsState.message
              : integrationsState.status === "unavailable"
                ? integrationsState.message
                : "We couldn't load the dashboard. Refresh the page to try again."}
          </AlertDescription>
        </Alert>
      </WorkspacePage>
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
    <WorkspacePage>
      <DashboardTimeZone current={timeZone} />
      <WorkspacePageHeader
        // Owners only: sending mails the whole workspace. The API enforces this
        // too, so hiding the control is convenience rather than authorization.
        action={
          workspaceState.workspace.role === "owner" ? (
            <SendDigestButton />
          ) : undefined
        }
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
    </WorkspacePage>
  );
}
