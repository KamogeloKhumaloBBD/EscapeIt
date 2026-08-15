import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  LinkIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
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
import { WorkspacePage } from "@/components/workspace-page";
import { WorkspaceStatus } from "@/components/workspace-status";
import {
  getIntegrationResourcesState,
  getIntegrationsState,
  getIntegrationState,
  getScopeDiscoveryState,
} from "@/lib/server/integration";
import { getNotificationChannelsState } from "@/lib/server/notification";
import { notificationSetupWarnings } from "@/lib/notification-health";
import {
  DisconnectInstallation,
  McpToolSelector,
  NotificationEventsChecklist,
  ResourceSelector,
  SimpleIntegrationAction,
} from "./integration-forms";
import {
  NotificationChannelsSection,
  NotificationRoutingSection,
} from "./notification-sections";
import { OAuthNotice } from "./oauth-notice";
import { ScopeSelector } from "./scope-selector";

export default async function IntegrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ oauth?: string; reason?: string }>;
}) {
  const [{ provider }, query] = await Promise.all([params, searchParams]);
  const state = await getIntegrationState(provider);

  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "not-found") notFound();

  if (state.status !== "available") {
    return (
      <WorkspacePage width="focused">
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Integration unavailable</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </WorkspacePage>
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
  const hasNotificationChannels = integration.capabilities.includes(
    "notification-channels",
  );
  const isInstallationConnected =
    integration.installation?.status === "connected";
  const isAccountConnected = integration.currentAccount?.status === "connected";
  const configuredResource =
    isInstallationConnected &&
    integration.installation !== null &&
    integration.installation.resource !== null
      ? integration.installation.resource
      : null;
  const hasConfiguredInstallation = configuredResource !== null;
  const enabledMcpTools = integration.mcpTools.filter((tool) => tool.enabled);
  const enabledNotificationEvents = integration.notificationEvents.filter(
    (event) => event.enabled,
  );
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
  const [resourcesState, scopesState, channelsState, integrationsState] =
    await Promise.all([
      needsResourceSelection
        ? getIntegrationResourcesState(provider)
        : Promise.resolve({ status: "not-found" } as const),
      canDiscoverScopes
        ? getScopeDiscoveryState(provider)
        : Promise.resolve({ status: "not-found" } as const),
      hasNotificationChannels || hasNotifications
        ? getNotificationChannelsState()
        : Promise.resolve({ status: "not-found" } as const),
      hasNotificationChannels
        ? getIntegrationsState()
        : Promise.resolve({ status: "not-found" } as const),
    ]);
  const allNotificationChannels =
    channelsState.status === "available" ? channelsState.data : [];
  const notificationChannels =
    channelsState.status === "available"
      ? allNotificationChannels.filter(
          (channel) => channel.provider === provider,
        )
      : [];
  const hasSubscribedConnectedChannel = allNotificationChannels.some(
    (channel) =>
      channel.status === "connected" &&
      channel.sourceProviders.includes(provider),
  );
  const connectedIntegrationCount = new Set(
    notificationChannels
      .filter((channel) => channel.status === "connected")
      .flatMap((channel) => channel.sourceProviders),
  ).size;
  const notificationSourceOptions =
    integrationsState.status === "available"
      ? integrationsState.data
          .filter((item) => item.capabilities.includes("notifications"))
          .map((item) => ({
            displayName: item.displayName,
            provider: item.provider,
          }))
      : [];
  const hasAvailableResources =
    resourcesState.status === "available" && resourcesState.data.length > 0;
  const hasNoAvailableResources =
    resourcesState.status === "available" && resourcesState.data.length === 0;
  const notificationWarnings = notificationSetupWarnings({
    channelErrorMessage:
      channelsState.status === "unavailable" ? channelsState.message : null,
    channelsAvailable: channelsState.status === "available",
    enabledEventCount: enabledNotificationEvents.length,
    eventCount: integration.notificationEvents.length,
    hasScopes,
    hasSubscribedConnectedChannel,
    providerDisplayName: integration.displayName,
    scopeLabel: scopeLabels?.plural ?? "resources",
    selectedScopeCount: integration.selectedScopes.length,
  });
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
    ...(hasNotificationChannels
      ? [
          ["Configured channels", String(notificationChannels.length)],
          ["Connected integrations", String(connectedIntegrationCount)],
        ]
      : []),
  ];
  const sections = [
    ...(hasAccount
      ? [{ href: "#personal-account", label: "Your account" }]
      : []),
    ...(hasApplicationResourceSelection
      ? [{ href: "#workspace-resource", label: `Workspace ${resourceLabel}` }]
      : []),
    ...(hasScopes
      ? [{ href: "#allowed-scopes", label: `Allowed ${scopeLabels.plural}` }]
      : []),
    ...(hasMcpTools ? [{ href: "#mcp-tools", label: "MCP tools" }] : []),
    ...(hasNotifications
      ? [{ href: "#notifications", label: "Notifications" }]
      : []),
    ...(hasNotificationChannels
      ? [{ href: "#notification-channels", label: "Channels and routing" }]
      : []),
  ];
  const summaryGridColumns =
    summaryMetrics.length >= 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : summaryMetrics.length === 3
        ? "sm:grid-cols-3"
        : summaryMetrics.length === 2
          ? "sm:grid-cols-2"
          : "sm:grid-cols-1";

  return (
    <WorkspacePage width="focused">
      {hasAccount ? (
        <OAuthNotice
          accountLabel={accountLabel}
          providerDisplayName={integration.displayName}
          reason={query.reason}
          result={query.oauth}
        />
      ) : null}
      <section className="relative overflow-hidden border border-border bg-card p-6 sm:p-8">
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
                <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  {integration.displayName}
                </h1>
                <WorkspaceStatus
                  tone={
                    integration.attention !== null
                      ? "attention"
                      : integration.nextStep === "ready"
                        ? "ready"
                        : integration.installation === null
                          ? "disconnected"
                          : "setup"
                  }
                >
                  {integration.attention !== null
                    ? "Needs attention"
                    : integration.nextStep === "ready"
                      ? "Ready"
                      : integration.installation === null
                        ? "Not connected"
                        : "Setup required"}
                </WorkspaceStatus>
              </div>
              <p className="mt-3 max-w-2xl leading-6 text-muted-foreground">
                {integration.description}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {isAccountConnected && isInstallationConnected ? (
              <SimpleIntegrationAction
                intent="validate"
                label="Validate connection"
                pendingLabel="Validating…"
                provider={provider}
              />
            ) : null}
            {integration.permissions.canManageInstallation ? (
              hasAccount && !isAccountConnected ? (
                <Button asChild>
                  <a href={`/api/integrations/${provider}/oauth/start`}>
                    <LinkIcon aria-hidden="true" data-icon="inline-start" />
                    Connect {integration.displayName}
                  </a>
                </Button>
              ) : hasApplicationResourceSelection &&
                resourceLabel &&
                hasAvailableResources ? (
                <Button asChild>
                  <a href="#workspace-resource">
                    <LinkIcon aria-hidden="true" data-icon="inline-start" />
                    Select {resourceLabel}
                  </a>
                </Button>
              ) : hasApplicationResourceSelection && hasNoAvailableResources ? (
                <Button asChild>
                  <a href={`/api/integrations/${provider}/oauth/start`}>
                    <LinkIcon aria-hidden="true" data-icon="inline-start" />
                    Install {integration.displayName} App
                  </a>
                </Button>
              ) : null
            ) : null}
          </div>
        </div>
        {summaryMetrics.length > 0 ? (
          <dl
            className={`relative mt-8 grid gap-px overflow-hidden border border-border bg-border ${summaryGridColumns}`}
          >
            {summaryMetrics.map(([label, value]) => (
              <div className="min-w-0 bg-card px-4 py-3.5" key={label}>
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

      {sections.length > 1 ? (
        <nav
          aria-label="Integration settings"
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
      ) : null}

      <div className="mt-8 space-y-6">
        {accountLabel !== undefined ? (
          <Card className="scroll-mt-36" id="personal-account">
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
                    <ItemTitle>Connected {accountLabel}</ItemTitle>
                    <ItemDescription>
                      Connected to your workspace identity.
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <SimpleIntegrationAction
                      accountLabel={accountLabel}
                      intent="disconnect-account"
                      label="Disconnect my account"
                      pendingLabel="Disconnecting…"
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
          <Card className="scroll-mt-36" id="workspace-resource">
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
              ) : resourcesState.status === "unavailable" ? (
                <Alert variant="destructive">
                  <WarningCircleIcon aria-hidden="true" />
                  <AlertTitle>Provider resources unavailable</AlertTitle>
                  <AlertDescription>{resourcesState.message}</AlertDescription>
                </Alert>
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
          <Card className="scroll-mt-36" id="allowed-scopes">
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
              ) : canDiscoverScopes && scopesState.status === "unavailable" ? (
                <Alert variant="destructive">
                  <WarningCircleIcon aria-hidden="true" />
                  <AlertTitle>
                    {integration.displayName} access unavailable
                  </AlertTitle>
                  <AlertDescription>{scopesState.message}</AlertDescription>
                </Alert>
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
          <Card className="scroll-mt-36" id="mcp-tools">
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
              {!isInstallationConnected ? (
                <Alert>
                  <AlertTitle>Integration connection required</AlertTitle>
                  <AlertDescription>
                    Connect {integration.displayName} before selecting MCP
                    tools.
                  </AlertDescription>
                </Alert>
              ) : integration.permissions.canManageMcpTools ? (
                <McpToolSelector
                  accountLabel={accountLabel}
                  disabled={false}
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
          <Card className="scroll-mt-36" id="notifications">
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Choose which {integration.displayName} activity gets relayed to
                workspace notification channels subscribed to it.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">
                  {enabledNotificationEvents.length} on
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              {notificationWarnings.length === 0 ? null : (
                <div className="mb-5 space-y-3">
                  {notificationWarnings.map((warning) => (
                    <Alert key={warning.title}>
                      <WarningCircleIcon aria-hidden="true" />
                      <AlertTitle>{warning.title}</AlertTitle>
                      <AlertDescription>{warning.message}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
              {integration.notificationSetupUrl === null ? null : (
                <div className="mb-5 flex flex-col gap-3 border border-dashed border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Confirm external approval in {integration.displayName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      If this site has not been approved yet, a site
                      administrator must complete this step before activity can
                      reach Context Layer.
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={integration.notificationSetupUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Approve in {integration.displayName}
                      <ArrowSquareOutIcon
                        aria-hidden="true"
                        data-icon="inline-end"
                      />
                    </a>
                  </Button>
                </div>
              )}
              <NotificationEventsChecklist
                disabled={!integration.permissions.canManageNotifications}
                events={integration.notificationEvents}
                provider={provider}
              />
            </CardContent>
          </Card>
        ) : null}

        {hasNotificationChannels ? (
          <div className="scroll-mt-36 space-y-6" id="notification-channels">
            <NotificationChannelsSection
              canManage={integration.permissions.canManageNotificationChannels}
              channels={notificationChannels}
              errorMessage={
                channelsState.status === "unavailable"
                  ? channelsState.message
                  : null
              }
              providerDisplayName={integration.displayName}
            />
            <NotificationRoutingSection
              canManage={integration.permissions.canManageNotificationChannels}
              channels={notificationChannels}
              errorMessage={
                integrationsState.status === "unavailable"
                  ? integrationsState.message
                  : null
              }
              sourceOptions={notificationSourceOptions}
            />
          </div>
        ) : null}
      </div>

      {hasConfiguredInstallation &&
      integration.permissions.canManageInstallation ? (
        <section className="mt-10 border border-destructive/25 bg-destructive/5 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-sm font-semibold">Disconnect integration</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Remove workspace access while retaining its activity history.
            </p>
          </div>
          <div className="mt-4 shrink-0 sm:mt-0">
            <DisconnectInstallation
              presentation={integration.presentation}
              provider={provider}
              providerDisplayName={integration.displayName}
            />
          </div>
        </section>
      ) : null}
    </WorkspacePage>
  );
}
