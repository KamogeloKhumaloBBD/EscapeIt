"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartLineIcon,
  ClockCounterClockwiseIcon,
} from "@phosphor-icons/react";
import { Area, AreaChart, CartesianGrid, Pie, PieChart, XAxis } from "recharts";

import { ProviderMark } from "@/components/integrations/provider-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
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
import type { WorkspaceAnalytics } from "@/lib/validation/workspace";

import { RankingExplorer } from "./ranking-explorer";

const usageChartConfig = {
  failedCount: {
    color: "var(--chart-5)",
    label: "Unsuccessful",
  },
  succeededCount: {
    color: "var(--chart-2)",
    label: "Successful",
  },
} satisfies ChartConfig;

const rankingChartConfig = {
  toolCallCount: {
    color: "var(--chart-2)",
    label: "Tool calls",
  },
} satisfies ChartConfig;

const pieColors = [
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-1)",
  "var(--muted-foreground)",
];

function titleCase(value: string): string {
  return value
    .replaceAll(/[-_]+/g, " ")
    .replaceAll(/\b\w/g, (character) => character.toUpperCase());
}

function toolLabel(toolName: string, provider?: string | null): string {
  const prefix =
    provider === undefined || provider === null ? "" : `${provider}_`;
  return titleCase(
    toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName,
  );
}

function providerLabel(
  provider: string | null,
  providerNames: Record<string, string>,
): string {
  return provider === null
    ? "Other"
    : (providerNames[provider] ?? titleCase(provider));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

function formatPercent(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en", {
        maximumFractionDigits: 1,
        style: "percent",
      }).format(value);
}

function comparison(
  current: number | null,
  previous: number | null,
  kind: "count" | "rate",
  lowerIsBetter = false,
): {
  label: string;
  tone: "bad" | "good" | "neutral";
  trend: "down" | "up" | null;
} {
  if (current === null || previous === null) {
    return { label: "No prior comparison", tone: "neutral", trend: null };
  }

  if (previous === 0) {
    return current === 0
      ? { label: "No change", tone: "neutral", trend: null }
      : { label: "New activity", tone: "neutral", trend: "up" };
  }

  const difference = current - previous;
  if (difference === 0) {
    return { label: "No change", tone: "neutral", trend: null };
  }

  const increased = difference > 0;
  const magnitude =
    kind === "rate"
      ? `${Math.abs(difference * 100).toFixed(1)} pts`
      : `${Math.abs((difference / previous) * 100).toFixed(0)}%`;
  const good = lowerIsBetter ? !increased : increased;
  return {
    label: `${magnitude} vs prior period`,
    tone: good ? "good" : "bad",
    trend: increased ? "up" : "down",
  };
}

function MetricCard({
  comparisonValue,
  current,
  format = (value: number) => value.toLocaleString(),
  kind = "count",
  label,
  lowerIsBetter,
  previous,
}: {
  comparisonValue?: number | null;
  current: number | null;
  format?: (value: number) => string;
  kind?: "count" | "rate";
  label: string;
  lowerIsBetter?: boolean;
  previous: number | null;
}) {
  const change = comparison(
    comparisonValue ?? current,
    previous,
    kind,
    lowerIsBetter,
  );
  const TrendIcon = change.trend === "up" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <div className="relative px-5 py-5 sm:px-6">
      <div className="absolute left-5 top-0 h-px w-10 bg-primary sm:left-6" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-3xl font-medium tracking-[-0.04em] tabular-nums">
        {current === null ? "—" : format(current)}
      </p>
      <p
        className={
          change.tone === "good"
            ? "mt-2 flex items-center gap-1 text-xs text-emerald-600"
            : change.tone === "bad"
              ? "mt-2 flex items-center gap-1 text-xs text-destructive"
              : "mt-2 flex items-center gap-1 text-xs text-muted-foreground"
        }
      >
        {change.trend === null ? null : <TrendIcon aria-hidden="true" />}
        {change.label}
      </p>
    </div>
  );
}

function AnalyticsEmpty({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Empty className="min-h-64 py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChartLineIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatActivityTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardAnalytics({
  analytics,
  providerNames,
  rankingFilters,
}: {
  analytics: WorkspaceAnalytics;
  providerNames: Record<string, string>;
  rankingFilters: {
    end: string;
    membershipId?: string;
    provider?: string;
    start: string;
  };
}) {
  const hasUsage = analytics.summary.toolCallCount > 0;
  const providerData = analytics.providerUsage.map((item, index) => ({
    ...item,
    fill: pieColors[index] ?? pieColors.at(-1),
    label: providerLabel(item.provider, providerNames),
  }));
  const providerCallCount = providerData.reduce(
    (total, item) => total + item.toolCallCount,
    0,
  );
  const toolData = analytics.toolUsage;
  const memberData = analytics.memberUsage ?? [];
  const largestToolCount = Math.max(
    1,
    ...toolData.map((item) => item.toolCallCount),
  );
  const largestMemberCount = Math.max(
    1,
    ...memberData.map((item) => item.toolCallCount),
  );

  return (
    <>
      <section
        aria-label="Usage summary"
        className="mt-9 overflow-hidden border border-border bg-card"
      >
        <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <MetricCard
            current={analytics.summary.toolCallCount}
            label="Tool calls"
            previous={analytics.comparison.summary.toolCallCount}
          />
          <MetricCard
            current={analytics.summary.successRate}
            format={formatPercent}
            kind="rate"
            label="Success rate"
            previous={analytics.comparison.summary.successRate}
          />
          <MetricCard
            current={analytics.summary.failedCount}
            label="Unsuccessful calls"
            lowerIsBetter
            previous={analytics.comparison.summary.failedCount}
          />
          <MetricCard
            current={analytics.summary.activeIntegrationCount}
            label="Integrations used"
            previous={analytics.comparison.summary.activeIntegrationCount}
          />
        </div>
      </section>

      <section aria-labelledby="usage-over-time" className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle id="usage-over-time">Usage over time</CardTitle>
            <CardDescription>
              Completed MCP tool calls grouped by UTC day.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">
                {analytics.range.start} – {analytics.range.end}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {!hasUsage ? (
              <AnalyticsEmpty
                description="Completed calls will appear here after you use a connected integration through MCP."
                title="No usage in this range"
              />
            ) : (
              <ChartContainer
                className="h-72 w-full aspect-auto"
                config={usageChartConfig}
              >
                <AreaChart accessibilityLayer data={analytics.dailyUsage}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="date"
                    minTickGap={36}
                    tickFormatter={shortDate}
                    tickLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => shortDate(String(value))}
                      />
                    }
                  />
                  <Area
                    dataKey="succeededCount"
                    fill="var(--color-succeededCount)"
                    fillOpacity={0.28}
                    stackId="usage"
                    stroke="var(--color-succeededCount)"
                    type="monotone"
                  />
                  <Area
                    dataKey="failedCount"
                    fill="var(--color-failedCount)"
                    fillOpacity={0.28}
                    stackId="usage"
                    stroke="var(--color-failedCount)"
                    type="monotone"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </section>

      <section
        aria-label="Usage rankings"
        className="mt-8 grid gap-8 xl:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle>Integration usage</CardTitle>
            <CardDescription>
              Share of completed calls by context source.
            </CardDescription>
            {providerData.length === 0 ? null : (
              <CardAction>
                <Badge variant="secondary">
                  {analytics.summary.activeIntegrationCount} used
                </Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="flex flex-1">
            {providerData.length === 0 ? (
              <AnalyticsEmpty
                description="Provider usage will appear after the first completed tool call."
                title="No integration usage"
              />
            ) : (
              <div className="grid w-full items-center gap-7 sm:grid-cols-[13rem_minmax(0,1fr)]">
                <div className="relative mx-auto size-52">
                  <ChartContainer
                    className="size-52 aspect-square"
                    config={rankingChartConfig}
                  >
                    <PieChart accessibilityLayer>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent hideLabel nameKey="label" />
                        }
                      />
                      <Pie
                        cornerRadius={2}
                        data={providerData}
                        dataKey="toolCallCount"
                        innerRadius={58}
                        nameKey="label"
                        outerRadius={84}
                        paddingAngle={providerData.length > 1 ? 2 : 0}
                        stroke="var(--card)"
                        strokeWidth={3}
                      />
                    </PieChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="font-mono text-3xl font-medium tracking-[-0.05em] tabular-nums">
                        {providerCallCount.toLocaleString()}
                      </p>
                      <p className="mt-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                        tool calls
                      </p>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-border border-y border-border">
                  {providerData.map((item) => (
                    <div
                      className="flex items-center gap-3 py-3 text-sm"
                      key={item.label}
                    >
                      {item.provider === null ? (
                        <span
                          aria-hidden="true"
                          className="grid size-9 shrink-0 place-items-center bg-muted text-xs font-semibold text-muted-foreground"
                        >
                          +
                        </span>
                      ) : (
                        <ProviderMark
                          displayName={item.label}
                          provider={item.provider}
                          size="sm"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0"
                            style={{ backgroundColor: item.fill }}
                          />
                          <p className="truncate font-medium">{item.label}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {providerCallCount === 0
                            ? "0% of usage"
                            : `${String(
                                Math.round(
                                  (item.toolCallCount / providerCallCount) *
                                    100,
                                ),
                              )}% of usage`}
                        </p>
                      </div>
                      <p className="font-mono text-base font-medium tabular-nums">
                        {item.toolCallCount.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most-used tools</CardTitle>
            <CardDescription>
              Showing {toolData.length} of {analytics.toolUsageTotal} tools by
              completed calls.
            </CardDescription>
            {analytics.toolUsageTotal === 0 ? null : (
              <CardAction>
                <RankingExplorer
                  dimension="tool"
                  filters={rankingFilters}
                  initialItems={toolData}
                  initialTotal={analytics.toolUsageTotal}
                  providerNames={providerNames}
                />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {toolData.length === 0 ? (
              <AnalyticsEmpty
                description="Tool rankings will appear after the first completed MCP call."
                title="No tool usage"
              />
            ) : (
              <div className="space-y-1" role="list">
                {toolData.map((item) => {
                  const rawName = item.toolName;
                  const displayProvider = providerLabel(
                    item.provider,
                    providerNames,
                  );

                  return (
                    <div
                      className="relative overflow-hidden border-b border-border/70 px-3 py-3 last:border-b-0"
                      key={`${item.provider}:${rawName}`}
                      role="listitem"
                    >
                      <div
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 bg-primary/8"
                        style={{
                          width: `${String(
                            (item.toolCallCount / largestToolCount) * 100,
                          )}%`,
                        }}
                      />
                      <div className="relative flex items-center gap-3">
                        <ProviderMark
                          displayName={displayProvider}
                          provider={item.provider}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs font-medium text-foreground">
                            {rawName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {displayProvider}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-medium tabular-nums">
                          {item.toolCallCount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {analytics.role === "owner" ? (
        <section aria-labelledby="member-usage" className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle id="member-usage">Usage by member</CardTitle>
              <CardDescription>
                Showing {memberData.length} of {analytics.memberUsageTotal ?? 0}{" "}
                active members.
              </CardDescription>
              <CardAction>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {analytics.summary.activeMemberCount} active
                  </Badge>
                  {(analytics.memberUsageTotal ?? 0) === 0 ? null : (
                    <RankingExplorer
                      dimension="member"
                      filters={rankingFilters}
                      initialItems={memberData}
                      initialTotal={analytics.memberUsageTotal ?? 0}
                      providerNames={providerNames}
                    />
                  )}
                </div>
              </CardAction>
            </CardHeader>
            <CardContent>
              {memberData.length === 0 ? (
                <AnalyticsEmpty
                  description="Member rankings will appear when workspace users begin calling tools."
                  title="No member usage"
                />
              ) : (
                <div className="grid gap-3" role="list">
                  {memberData.map((item) => (
                    <div
                      className="relative overflow-hidden border border-border px-4 py-4"
                      key={item.membershipId}
                      role="listitem"
                    >
                      <div
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 bg-primary/8"
                        style={{
                          width: `${String(
                            (item.toolCallCount / largestMemberCount) * 100,
                          )}%`,
                        }}
                      />
                      <div className="relative flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{initials(item.email)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {item.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {item.email}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-lg font-medium tabular-nums">
                            {item.toolCallCount.toLocaleString()}
                          </p>
                          <p className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                            calls
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="recent-tool-activity" className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle id="recent-tool-activity">
              Recent tool activity
            </CardTitle>
            <CardDescription>
              The latest completed calls within the selected range.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.recentActivity.length === 0 ? (
              <Empty className="min-h-52 py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ClockCounterClockwiseIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No recent tool activity</EmptyTitle>
                  <EmptyDescription>
                    Choose another date range or make a call through a connected
                    integration.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup className="gap-0">
                {analytics.recentActivity.map((activity, index) => (
                  <div key={activity.id}>
                    {index > 0 ? <ItemSeparator /> : null}
                    <Item className="border-0 px-0 py-3.5">
                      <ItemMedia>
                        <ProviderMark
                          displayName={providerLabel(
                            activity.provider,
                            providerNames,
                          )}
                          provider={activity.provider}
                          size="sm"
                        />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>
                          {toolLabel(activity.toolName, activity.provider)}
                          <Badge
                            variant={
                              activity.status === "succeeded"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {activity.status === "succeeded"
                              ? "Succeeded"
                              : "Failed"}
                          </Badge>
                        </ItemTitle>
                        <ItemDescription>
                          {providerLabel(activity.provider, providerNames)}
                          {activity.member === undefined
                            ? ""
                            : ` · ${activity.member.name} (${activity.member.email})`}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <time
                          className="font-mono text-xs text-muted-foreground tabular-nums"
                          dateTime={activity.occurredAt}
                        >
                          {formatActivityTime(activity.occurredAt)}
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
    </>
  );
}
