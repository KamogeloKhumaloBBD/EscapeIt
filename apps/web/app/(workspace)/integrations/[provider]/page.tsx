import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  LinkIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProviderMark } from "@/components/integrations/provider-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  getIntegrationResourcesState,
  getIntegrationState,
  getScopeDiscoveryState,
} from "@/lib/server/integration";
import {
  DisconnectInstallation,
  SimpleIntegrationAction,
  SiteSelector,
} from "./integration-forms";
import { OAuthNotice } from "./oauth-notice";
import { ProjectSelector } from "./project-selector";

export default async function IntegrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ oauth?: string }>;
}) {
  const [{ provider }, query] = await Promise.all([params, searchParams]);
  const state = await getIntegrationState(provider);

  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "not-found") notFound();

  if (state.status !== "available") {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-16 lg:px-10">
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Integration unavailable</AlertTitle>
          <AlertDescription>Refresh the page to try again.</AlertDescription>
        </Alert>
      </main>
    );
  }

  const integration = state.data;
  const needsSiteSelection =
    integration.permissions.canManageInstallation &&
    integration.currentAccount?.status === "connected" &&
    integration.installation?.resource === null;
  const canDiscoverProjects =
    integration.permissions.canManageScopes &&
    integration.currentAccount?.status === "connected" &&
    integration.installation?.resource !== null;
  const [resourcesState, scopesState] = await Promise.all([
    needsSiteSelection
      ? getIntegrationResourcesState(provider)
      : Promise.resolve({ status: "not-found" } as const),
    canDiscoverProjects
      ? getScopeDiscoveryState(provider)
      : Promise.resolve({ status: "not-found" } as const),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-7 lg:px-10 lg:pt-10">
      <OAuthNotice result={query.oauth} />
      <Button asChild size="sm" variant="ghost">
        <Link href="/integrations">
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          Integrations
        </Link>
      </Button>

      <section className="relative mt-6 overflow-hidden border border-border bg-card p-6 sm:p-8">
        <div className="absolute -right-24 -top-32 size-80 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-5">
            <ProviderMark
              displayName={integration.displayName}
              provider={provider}
              size="lg"
            />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold tracking-[-0.055em]">
                  {integration.displayName}
                </h1>
                <Badge
                  variant={
                    integration.attention === null ? "secondary" : "destructive"
                  }
                >
                  {integration.nextStep === "ready"
                    ? "Ready"
                    : "Setup required"}
                </Badge>
              </div>
              <p className="mt-3 max-w-2xl leading-6 text-muted-foreground">
                {integration.description}
              </p>
            </div>
          </div>
          {integration.currentAccount?.status === "connected" ? (
            <SimpleIntegrationAction
              intent="validate"
              label="Validate connection"
              pendingLabel="Validating..."
              provider={provider}
            />
          ) : null}
        </div>
        <dl className="relative mt-8 grid overflow-hidden border border-border bg-muted/28 sm:grid-cols-3">
          {[
            [
              "Account",
              integration.currentAccount?.status === "connected"
                ? "Connected"
                : "Not connected",
            ],
            [
              "Workspace resource",
              integration.installation?.resource?.name ?? "Not selected",
            ],
            ["Allowed projects", String(integration.selectedScopes.length)],
          ].map(([label, value], index) => (
            <div
              className={`min-w-0 px-4 py-3.5 ${index > 0 ? "border-t sm:border-l sm:border-t-0" : ""}`}
              key={label}
            >
              <dt className="text-[0.6875rem] font-medium text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {integration.attention !== null ? (
        <Alert className="mt-8" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Attention required</AlertTitle>
          <AlertDescription>{integration.attention}</AlertDescription>
        </Alert>
      ) : null}

      <div className="relative mt-10 space-y-6 md:pl-14">
        <div className="flow-rail absolute bottom-16 left-5 top-12 hidden w-px md:block" />
        <Card className="relative overflow-visible">
          <span className="absolute -left-12 top-7 z-10 hidden size-9 place-items-center border border-primary/30 bg-card font-mono text-xs font-semibold text-primary md:grid">
            01
          </span>
          <CardHeader>
            <CardTitle>Your Atlassian account</CardTitle>
            <CardDescription>
              Jira requests use your own Atlassian permissions. Credentials are
              encrypted and never shared with other members.
            </CardDescription>
            <CardAction>
              <Badge
                variant={
                  integration.currentAccount?.status === "connected"
                    ? "secondary"
                    : "ghost"
                }
              >
                {integration.currentAccount?.status === "connected"
                  ? "Connected"
                  : "Not connected"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {integration.currentAccount?.status === "connected" ? (
              <Item variant="muted">
                <ItemMedia variant="icon">
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="text-emerald-600"
                    weight="fill"
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {integration.currentAccount.displayName ??
                      "Atlassian account"}
                  </ItemTitle>
                  <ItemDescription>
                    Connected to your workspace identity.
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <SimpleIntegrationAction
                    intent="disconnect-account"
                    label="Disconnect my account"
                    pendingLabel="Disconnecting..."
                    provider={provider}
                    variant="destructive"
                  />
                </ItemActions>
              </Item>
            ) : integration.permissions.canConnectAccount ? (
              <Empty className="items-start p-0 text-left">
                <EmptyHeader className="items-start">
                  <EmptyMedia variant="icon">
                    <LinkIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Connect your Atlassian identity</EmptyTitle>
                  <EmptyDescription>
                    Atlassian will ask you to authorize the Jira site available
                    to this workspace.
                  </EmptyDescription>
                </EmptyHeader>
                <Button asChild>
                  <a href={`/api/integrations/${provider}/oauth/start`}>
                    <LinkIcon aria-hidden="true" data-icon="inline-start" />
                    Connect Atlassian account
                  </a>
                </Button>
              </Empty>
            ) : (
              <Alert>
                <AlertTitle>Waiting for the workspace owner</AlertTitle>
                <AlertDescription>
                  The owner must install Jira before members can connect their
                  accounts.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-visible">
          <span className="absolute -left-12 top-7 z-10 hidden size-9 place-items-center border border-primary/30 bg-card font-mono text-xs font-semibold text-primary md:grid">
            02
          </span>
          <CardHeader>
            <CardTitle>Workspace Jira site</CardTitle>
            <CardDescription>
              The workspace uses one Jira Cloud site. Only the owner can select
              or remove it.
            </CardDescription>
            <CardAction>
              <Badge
                variant={
                  integration.installation?.resource === null
                    ? "ghost"
                    : "secondary"
                }
              >
                {integration.installation?.resource === null
                  ? "Not selected"
                  : "Configured"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {integration.installation?.resource !== null &&
            integration.installation?.resource !== undefined ? (
              <Item variant="muted">
                <ItemContent>
                  <ItemTitle>
                    {integration.installation.resource.name}
                  </ItemTitle>
                  <ItemDescription>
                    {integration.installation.resource.url}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    asChild
                    aria-label={`Open ${integration.installation.resource.name}`}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <a
                      href={integration.installation.resource.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ArrowSquareOutIcon aria-hidden="true" />
                    </a>
                  </Button>
                </ItemActions>
              </Item>
            ) : resourcesState.status === "available" &&
              resourcesState.data.length > 0 ? (
              <SiteSelector
                provider={provider}
                resources={resourcesState.data}
              />
            ) : integration.currentAccount?.status !== "connected" ? (
              <Alert>
                <AlertTitle>Account required</AlertTitle>
                <AlertDescription>
                  Connect your Atlassian account first.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>No eligible Jira site</AlertTitle>
                <AlertDescription>
                  Reconnect and select the site intended for this workspace.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          {integration.permissions.canManageInstallation &&
          integration.installation !== null ? (
            <CardFooter className="flex-col items-start justify-between gap-5 border-t sm:flex-row sm:items-center">
              <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                Disconnecting clears member credentials and project access while
                preserving activity history.
              </p>
              <DisconnectInstallation provider={provider} />
            </CardFooter>
          ) : null}
        </Card>

        <Card className="relative overflow-visible">
          <span className="absolute -left-12 top-7 z-10 hidden size-9 place-items-center border border-primary/30 bg-card font-mono text-xs font-semibold text-primary md:grid">
            03
          </span>
          <CardHeader>
            <CardTitle>Allowed Jira projects</CardTitle>
            <CardDescription>
              This allowlist is checked before Jira is called. No selected
              projects means no Jira context is available.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">
                {integration.selectedScopes.length} selected
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {canDiscoverProjects && scopesState.status === "available" ? (
              <ProjectSelector
                initialItems={scopesState.data.items}
                initialNextCursor={scopesState.data.nextCursor}
                initialSelected={integration.selectedScopes}
                provider={provider}
              />
            ) : integration.permissions.canManageScopes ? (
              <Alert>
                <AlertTitle>Site required</AlertTitle>
                <AlertDescription>
                  Connect your account and select the Jira site before choosing
                  projects.
                </AlertDescription>
              </Alert>
            ) : integration.selectedScopes.length > 0 ? (
              <ItemGroup className="gap-0">
                {integration.selectedScopes.map((scope, index) => (
                  <div key={scope.externalId}>
                    {index > 0 ? <ItemSeparator /> : null}
                    <Item>
                      <ItemMedia variant="icon">
                        <ShieldCheckIcon aria-hidden="true" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{scope.displayName}</ItemTitle>
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
                  <EmptyTitle>No projects allowed</EmptyTitle>
                  <EmptyDescription>
                    The workspace owner has not enabled any Jira projects.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
