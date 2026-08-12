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
  getNotificationChannelsState,
  getNotificationPreferencesState,
} from "@/lib/server/notification";
import {
  DisconnectInstallation,
  McpToolSelector,
  ResourceSelector,
  SimpleIntegrationAction,
} from "./integration-forms";
import {
  NotificationChannelsSection,
  NotificationEventsSection,
} from "./notification-sections";
import { OAuthNotice } from "./oauth-notice";
import { ScopeSelector } from "./scope-selector";

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
  const { accountLabel, resourceLabel, scopeLabels } = integration.presentation;
  const hasAccount =
    integration.capabilities.includes("user-accounts") &&
    accountLabel !== undefined;
  const hasResource = resourceLabel !== undefined;
  const hasApplicationResourceSelection =
    hasResource && integration.resourceSelection === "application";
  const hasScopes =
    integration.capabilities.includes("scopes") && scopeLabels !== undefined;
  const hasMcpTools = integration.capabilities.includes("context");
  const hasNotifications = integration.capabilities.includes("notifications");
  const isInstallationConnected =
    integration.installation?.status === "connected";
  const configuredResource =
    isInstallationConnected &&
    integration.installation !== null &&
    integration.installation.resource !== null
      ? integration.installation.resource
      : null;
  const hasConfiguredInstallation = configuredResource !== null;
  const enabledMcpTools = integration.mcpTools.filter((tool) => tool.enabled);
  const needsResourceSelection =
    hasApplicationResourceSelection &&
    integration.permissions.canManageInstallation &&
    integration.currentAccount?.status === "connected" &&
    integration.installation?.resource === null;
  const canDiscoverScopes =
    hasScopes &&
    integration.permissions.canManageScopes &&
    integration.currentAccount?.status === "connected" &&
    integration.installation?.resource !== null;
  const [resourcesState, scopesState, channelsState, preferencesState] =
    await Promise.all([
      needsResourceSelection
        ? getIntegrationResourcesState(provider)
        : Promise.resolve({ status: "not-found" } as const),
      canDiscoverScopes
        ? getScopeDiscoveryState(provider)
        : Promise.resolve({ status: "not-found" } as const),
      hasNotifications
        ? getNotificationChannelsState()
        : Promise.resolve({ status: "not-found" } as const),
      hasNotifications
        ? getNotificationPreferencesState()
        : Promise.resolve({ status: "not-found" } as const),
    ]);
  const notificationChannels =
    channelsState.status === "available"
      ? channelsState.data.filter((channel) => channel.provider === provider)
      : [];
  const notificationPreferences =
    preferencesState.status === "available" ? preferencesState.data : [];
  const summaryMetrics = [
    ...(hasAccount
      ? [
          [
            "Account",
            integration.currentAccount?.status === "connected"
              ? "Connected"
              : "Not connected",
          ],
        ]
      : []),
    ...(hasResource
      ? [
          [
            `Workspace ${resourceLabel}`,
            configuredResource?.name ?? "Not selected",
          ],
        ]
      : []),
    ...(hasScopes
      ? [
          [
            `Allowed ${scopeLabels.plural}`,
            String(integration.selectedScopes.length),
          ],
        ]
      : []),
    ...(hasMcpTools
      ? [["Enabled MCP tools", String(enabledMcpTools.length)]]
      : []),
    ...(hasNotifications
      ? [["Connected channels", String(notificationChannels.length)]]
      : []),
  ];
  let nextSectionNumber = 0;
  const accountSectionNumber = hasAccount ? (nextSectionNumber += 1) : null;
  const resourceSectionNumber = hasApplicationResourceSelection
    ? (nextSectionNumber += 1)
    : null;
  const scopeSectionNumber = hasScopes ? (nextSectionNumber += 1) : null;
  const toolSectionNumber = hasMcpTools ? (nextSectionNumber += 1) : null;
  const notificationSectionNumber = hasNotifications
    ? (nextSectionNumber += 1)
    : null;
  const summaryGridColumns =
    summaryMetrics.length === 4
      ? "sm:grid-cols-4"
      : summaryMetrics.length === 3
        ? "sm:grid-cols-3"
        : summaryMetrics.length === 2
          ? "sm:grid-cols-2"
          : "sm:grid-cols-1";

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-7 lg:px-10 lg:pt-10">
      {hasAccount ? (
        <OAuthNotice accountLabel={accountLabel} result={query.oauth} />
      ) : null}
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
          <div className="flex flex-wrap items-center justify-end gap-3">
            {integration.currentAccount?.status === "connected" ? (
              <SimpleIntegrationAction
                intent="validate"
                label="Validate connection"
                pendingLabel="Validating..."
                provider={provider}
              />
            ) : null}
            {integration.permissions.canManageInstallation ? (
              hasConfiguredInstallation ? (
                <DisconnectInstallation
                  presentation={integration.presentation}
                  provider={provider}
                  providerDisplayName={integration.displayName}
                />
              ) : hasAccount ? (
                <Button asChild>
                  <a href={`/api/integrations/${provider}/oauth/start`}>
                    <LinkIcon aria-hidden="true" data-icon="inline-start" />
                    Connect {integration.displayName}
                  </a>
                </Button>
              ) : null
            ) : null}
          </div>
        </div>
        {summaryMetrics.length > 0 ? (
          <dl
            className={`relative mt-8 grid overflow-hidden border border-border bg-muted/28 ${summaryGridColumns}`}
          >
            {summaryMetrics.map(([label, value], index) => (
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
        ) : null}
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
        {accountLabel !== undefined ? (
          <Card className="relative overflow-visible">
            <span className="absolute -left-12 top-7 z-10 hidden size-9 place-items-center border border-primary/30 bg-card font-mono text-xs font-semibold text-primary md:grid">
              {String(accountSectionNumber).padStart(2, "0")}
            </span>
            <CardHeader>
              <CardTitle>Your {accountLabel}</CardTitle>
              <CardDescription>
                {integration.displayName} requests use your own {accountLabel}.
                Credentials are encrypted and never shared with other members.
              </CardDescription>
              <CardAction>
                <Badge variant={"secondary"}>
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
                      {integration.currentAccount.displayName ?? accountLabel}
                    </ItemTitle>
                    <ItemDescription>
                      Connected to your workspace identity.
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <SimpleIntegrationAction
                      accountLabel={accountLabel}
                      intent="disconnect-account"
                      label="Disconnect my account"
                      pendingLabel="Disconnecting..."
                      provider={provider}
                      providerDisplayName={integration.displayName}
                      variant="destructive"
                    />
                  </ItemActions>
                </Item>
              ) : integration.permissions.canConnectAccount ? (
                <Item variant="muted">
                  <ItemMedia variant="icon">
                    <LinkIcon aria-hidden="true" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Connect your {accountLabel}</ItemTitle>
                    <ItemDescription>
                      Authorize the account that {integration.displayName}{" "}
                      should use for your workspace identity.
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="w-full sm:ml-auto sm:w-auto">
                    <Button asChild className="w-full sm:w-auto">
                      <a href={`/api/integrations/${provider}/oauth/start`}>
                        <LinkIcon aria-hidden="true" data-icon="inline-start" />
                        Connect {accountLabel}
                      </a>
                    </Button>
                  </ItemActions>
                </Item>
              ) : (
                <Alert>
                  <AlertTitle>Waiting for the workspace owner</AlertTitle>
                  <AlertDescription>
                    The owner must install {integration.displayName} before
                    members can connect their accounts.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ) : null}

        {hasApplicationResourceSelection ? (
          <Card className="relative overflow-visible">
            <span className="absolute -left-12 top-7 z-10 hidden size-9 place-items-center border border-primary/30 bg-card font-mono text-xs font-semibold text-primary md:grid">
              {String(resourceSectionNumber).padStart(2, "0")}
            </span>
            <CardHeader>
              <CardTitle>Workspace {resourceLabel}</CardTitle>
              <CardDescription>
                The workspace uses one {resourceLabel}. Only the owner can
                select or remove it.
              </CardDescription>
              <CardAction>
                <Badge
                  variant={hasConfiguredInstallation ? "secondary" : "ghost"}
                >
                  {hasConfiguredInstallation ? "Configured" : "Not selected"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              {configuredResource !== null ? (
                <Item variant="muted">
                  <ItemContent>
                    <ItemTitle>{configuredResource.name}</ItemTitle>
                    <ItemDescription>{configuredResource.url}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      asChild
                      aria-label={`Open ${configuredResource.name}`}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <a
                        href={configuredResource.url}
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
                <ResourceSelector
                  provider={provider}
                  resourceLabel={resourceLabel}
                  resources={resourcesState.data}
                />
              ) : integration.currentAccount?.status !== "connected" ? (
                <Alert>
                  <AlertTitle>Account required</AlertTitle>
                  <AlertDescription>
                    Connect your {accountLabel ?? "provider account"} first.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTitle>No eligible {resourceLabel}</AlertTitle>
                  <AlertDescription>
                    Reconnect and select the {resourceLabel} intended for this
                    workspace.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ) : null}

        {scopeLabels !== undefined ? (
          <Card
            aria-disabled={!isInstallationConnected}
            className={`relative overflow-visible ${isInstallationConnected ? "" : "opacity-60"}`}
          >
            <span className="absolute -left-12 top-7 z-10 hidden size-9 place-items-center border border-primary/30 bg-card font-mono text-xs font-semibold text-primary md:grid">
              {String(scopeSectionNumber).padStart(2, "0")}
            </span>
            <CardHeader>
              <CardTitle>Allowed {scopeLabels.plural}</CardTitle>
              <CardDescription>
                This allowlist is checked before {integration.displayName} is
                called. No selected {scopeLabels.plural} means no provider
                context is available.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">
                  {integration.selectedScopes.length} selected
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              {!isInstallationConnected ? (
                <Alert>
                  <AlertTitle>Integration connection required</AlertTitle>
                  <AlertDescription>
                    Connect {integration.displayName} before choosing{" "}
                    {scopeLabels.plural}.
                  </AlertDescription>
                </Alert>
              ) : canDiscoverScopes && scopesState.status === "available" ? (
                <ScopeSelector
                  initialItems={scopesState.data.items}
                  initialNextCursor={scopesState.data.nextCursor}
                  initialSelected={integration.selectedScopes}
                  provider={provider}
                  providerDisplayName={integration.displayName}
                  scopeLabels={scopeLabels}
                />
              ) : integration.permissions.canManageScopes ? (
                <Alert>
                  <AlertTitle>
                    {hasAccount &&
                    integration.currentAccount?.status !== "connected"
                      ? `${accountLabel} required`
                      : `${resourceLabel ?? "Workspace resource"} required`}
                  </AlertTitle>
                  <AlertDescription>
                    {hasAccount &&
                    integration.currentAccount?.status !== "connected"
                      ? `Connect your ${accountLabel} before choosing ${scopeLabels.plural}.`
                      : `Select the workspace ${resourceLabel ?? "resource"} before choosing ${scopeLabels.plural}.`}
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
                    <EmptyTitle>No {scopeLabels.plural} allowed</EmptyTitle>
                    <EmptyDescription>
                      The workspace owner has not enabled any{" "}
                      {integration.displayName} {scopeLabels.plural}.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        ) : null}

        {hasMcpTools ? (
          <Card
            aria-disabled={!isInstallationConnected}
            className={`relative overflow-visible ${isInstallationConnected ? "" : "opacity-60"}`}
          >
            <span className="absolute -left-12 top-7 z-10 hidden size-9 place-items-center border border-primary/30 bg-card font-mono text-xs font-semibold text-primary md:grid">
              {String(toolSectionNumber).padStart(2, "0")}
            </span>
            <CardHeader>
              <CardTitle>MCP tools</CardTitle>
              <CardDescription>
                Only enabled tools are shown to agents using workspace MCP
                tokens. Tool access still respects workspace scope governance
                and each member&apos;s {integration.displayName} permissions.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">
                  {enabledMcpTools.length} enabled
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              {integration.permissions.canManageMcpTools ||
              (!isInstallationConnected &&
                integration.permissions.canManageInstallation &&
                integration.installation !== null) ? (
                <McpToolSelector
                  accountLabel={accountLabel}
                  disabled={!isInstallationConnected}
                  key={enabledMcpTools.map((tool) => tool.name).join("|")}
                  provider={provider}
                  providerDisplayName={integration.displayName}
                  tools={integration.mcpTools}
                />
              ) : enabledMcpTools.length > 0 ? (
                <ItemGroup className="gap-0">
                  {enabledMcpTools.map((tool, index) => (
                    <div key={tool.name}>
                      {index > 0 ? <ItemSeparator /> : null}
                      <Item>
                        <ItemMedia variant="icon">
                          <ShieldCheckIcon aria-hidden="true" />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>
                            {tool.displayName}
                            <Badge variant={"secondary"}>{tool.kind}</Badge>
                          </ItemTitle>
                          <ItemDescription>{tool.description}</ItemDescription>
                        </ItemContent>
                      </Item>
                    </div>
                  ))}
                </ItemGroup>
              ) : integration.installation === null ? (
                <Alert>
                  <AlertTitle>Integration required</AlertTitle>
                  <AlertDescription>
                    Install {integration.displayName} before selecting MCP
                    tools.
                  </AlertDescription>
                </Alert>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ShieldCheckIcon aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>No MCP tools enabled</EmptyTitle>
                    <EmptyDescription>
                      The workspace owner has not enabled any{" "}
                      {integration.displayName} MCP tools.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        ) : null}

        {hasNotifications ? (
          <div className="relative space-y-6">
            <span className="absolute -left-12 top-7 z-10 hidden size-9 place-items-center border border-primary/30 bg-card font-mono text-xs font-semibold text-primary md:grid">
              {String(notificationSectionNumber).padStart(2, "0")}
            </span>
            <NotificationChannelsSection channels={notificationChannels} />
            <NotificationEventsSection preferences={notificationPreferences} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
