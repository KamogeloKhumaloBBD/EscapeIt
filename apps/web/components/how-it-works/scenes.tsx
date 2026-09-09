"use client";

import {
  CheckIcon,
  EnvelopeSimpleIcon,
  KeyIcon,
  PackageIcon,
  RobotIcon,
  ShieldCheckIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useRef, useState, type ReactNode, type RefObject } from "react";

import { BrandIcon } from "@/components/brand-icon";
import {
  Playback,
  ScenePaths,
  useSceneClock,
  type SceneRoute,
} from "@/components/how-it-works/animation";
import { ProviderMark } from "@/components/integrations/provider-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const mapStyle =
  "relative isolate [&_[data-node]]:relative [&_[data-node]]:z-2";
const revealStyle =
  "transition-all duration-500 data-[revealed=false]:translate-y-1 data-[revealed=false]:opacity-0 motion-reduce:transition-none";
const providers = [
  { key: "jira", name: "Jira" },
  { key: "github", name: "GitHub" },
  { key: "confluence", name: "Confluence" },
] as const;

function Figure({
  name,
  description,
  clock,
  figureRef,
  children,
  caption,
}: {
  name: string;
  description: string;
  clock: ReturnType<typeof useSceneClock>;
  figureRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  caption: string;
}) {
  return (
    <figure
      ref={figureRef}
      data-scene={name}
      data-running={clock.running}
      className="landing-feature-scene @container/scene w-full min-w-0 overflow-hidden border border-[#ded9cf] bg-[#f8f6f1] p-4 shadow-[0_22px_65px_rgba(44,37,63,0.1)] sm:p-6 max-xl:mx-auto max-xl:max-w-[800px]"
    >
      <figcaption className="sr-only">{description}</figcaption>
      {children}
      <div className="mt-5 flex min-h-10 items-center justify-between gap-3 border-t border-[#e2ddd3] pt-4 text-[11px] leading-relaxed text-[#82796c]">
        <span>{caption}</span>
        <Playback name={name} clock={clock} />
      </div>
    </figure>
  );
}

function Agent({
  node,
  name,
  compact = false,
}: {
  node: string;
  name: string;
  compact?: boolean;
}) {
  return (
    <div
      data-node={node}
      className="flex w-fit flex-col items-center gap-1.5 text-center"
    >
      <span
        className={cn(
          "grid place-items-center border border-[#d9ceee] bg-[#f4efff] text-[#7053c5] shadow-[0_8px_22px_rgba(42,32,76,0.08)]",
          compact ? "size-8" : "size-10",
        )}
      >
        <RobotIcon
          className={compact ? "size-4" : "size-6"}
          weight="duotone"
          aria-hidden="true"
        />
      </span>
      <strong className="text-[10px] font-medium">{name}</strong>
    </div>
  );
}

function Core({
  node = "core",
  compact = false,
  label = "",
}: {
  node?: string;
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      data-node={node}
      className={cn(
        "flex flex-col items-center justify-center border border-[#29242f] bg-[#17151b] text-center text-white shadow-[0_14px_34px_rgba(42,32,76,0.2)]",
        compact
          ? "min-h-20 w-[74px] p-2 @min-[440px]/scene:w-[86px]"
          : "min-h-24 w-28 p-3",
      )}
    >
      <BrandIcon className={compact ? "size-5" : "size-6"} />
      <strong className="mt-1.5 text-[11px] font-semibold">
        Context Layer
      </strong>
      <span className="mt-1 text-[9px] leading-tight text-[#c5b9d5]">
        {label}
      </span>
    </div>
  );
}

function ProviderNode({
  provider,
  name,
  node,
  detail,
}: {
  provider: string;
  name: string;
  node: string;
  detail?: string;
}) {
  return (
    <div
      data-node={node}
      className="flex min-w-0 items-center gap-2 border border-[#e3ded5] bg-white px-2 py-1.5 shadow-[0_7px_18px_rgba(30,25,50,0.06)]"
    >
      <ProviderMark
        provider={provider}
        displayName={name}
        size="sm"
        className="size-6 shrink-0"
      />
      <span className="min-w-0">
        <strong className="block truncate text-[10px] font-medium">
          {name}
        </strong>
        {detail !== undefined && (
          <span className="block truncate text-[9px] text-[#82796c]">
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}

const beforeRoutes: readonly SceneRoute[] = [
  ...providers.map((provider, index) => ({
    id: `alex-${provider.key}`,
    from: "before-alex",
    to: `before-${provider.key}`,
    verticalFrom: "right" as const,
    verticalTo: "left" as const,
    signals:
      index === 0
        ? [
            { start: 0.4, end: 1.3 },
            { start: 1.3, end: 2.2, reverse: true },
          ]
        : [],
  })),
  ...providers.map((provider) => ({
    id: `sam-${provider.key}`,
    from: "before-sam",
    to: `before-${provider.key}`,
    verticalFrom: "right" as const,
    verticalTo: "left" as const,
  })),
];

const afterRoutes: readonly SceneRoute[] = [
  {
    id: "alex-core",
    from: "after-alex",
    to: "after-core",
    signals: [
      { start: 3, end: 3.7 },
      { start: 5.1, end: 5.8, reverse: true },
    ],
  },
  {
    id: "sam-core",
    from: "after-sam",
    to: "after-core",
  },
  ...providers.map((provider, index) => ({
    id: `core-${provider.key}`,
    from: "after-core",
    to: `after-${provider.key}`,
    signals:
      index === 0
        ? [
            { start: 3.7, end: 4.4 },
            { start: 4.4, end: 5.1, reverse: true },
          ]
        : [],
  })),
];

function People({
  prefix,
  mobileRow = false,
}: {
  prefix: "before" | "after";
  mobileRow?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-8",
        mobileRow &&
          "@max-[440px]/scene:w-full @max-[440px]/scene:flex-row @max-[440px]/scene:justify-around",
      )}
    >
      <Agent node={`${prefix}-alex`} name="Alex’s agent" compact />
      <Agent node={`${prefix}-sam`} name="Sam’s agent" compact />
    </div>
  );
}

function ProviderStack({ prefix }: { prefix: "before" | "after" }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {providers.map((provider) => (
        <ProviderNode
          key={provider.key}
          provider={provider.key}
          name={provider.name}
          node={`${prefix}-${provider.key}`}
        />
      ))}
    </div>
  );
}

export function ConnectScene() {
  const figureRef = useRef<HTMLElement>(null);
  const beforeMap = useRef<HTMLDivElement>(null);
  const afterMap = useRef<HTMLDivElement>(null);
  const clock = useSceneClock(10, figureRef);
  return (
    <Figure
      name="connect"
      figureRef={figureRef}
      clock={clock}
      caption="Same agents. Same tools. Far less setup."
      description="Before Context Layer, Alex and Sam each maintain direct connections to Jira, GitHub, and Confluence. With Context Layer, both agents use one MCP endpoint to reach workspace tools using their own personal accounts."
    >
      <div className="grid gap-4 @min-[700px]/scene:grid-cols-2">
        <section className="min-w-0 border border-[#ded9cf] bg-white p-3 shadow-[0_12px_30px_rgba(30,25,50,0.055)] sm:p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#ebe6dd] pb-3">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-[#8a8177] uppercase">
              Before
            </span>
            <strong className="text-[11px] text-[#9a6630]">
              6 separate connections
            </strong>
          </div>
          <div
            ref={beforeMap}
            className={cn(
              mapStyle,
              "grid min-h-52 grid-cols-[54px_minmax(0,1fr)] items-center gap-5 px-1 @min-[440px]/scene:grid-cols-[70px_1fr] @min-[440px]/scene:gap-14",
            )}
          >
            <ScenePaths
              container={beforeMap}
              routes={beforeRoutes}
              time={clock.time}
            />
            <People prefix="before" />
            <ProviderStack prefix="before" />
          </div>
          <p className="mt-4 border-t border-[#ebe6dd] pt-3 text-center text-[10px] text-[#82796c]">
            Configure and maintain every connection
          </p>
        </section>

        <section className="min-w-0 border border-[#cfc2ed] bg-[#f5f1fb]/90 p-3 shadow-[0_12px_34px_rgba(73,48,221,0.08)] sm:p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#ded4ef] pb-3">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-[#6743a0] uppercase">
              With Context Layer
            </span>
            <strong className="text-[11px] text-[#5a41e8]">
              1 MCP endpoint
            </strong>
          </div>
          <div
            ref={afterMap}
            className={cn(
              mapStyle,
              "flex min-h-52 flex-col items-center gap-8 @min-[440px]/scene:grid @min-[440px]/scene:grid-cols-[62px_86px_1fr] @min-[440px]/scene:gap-5",
            )}
          >
            <ScenePaths
              container={afterMap}
              routes={afterRoutes}
              time={clock.time}
            />
            <People prefix="after" mobileRow />
            <Core node="after-core" compact />
            <div className="w-full border border-[#d8cdec] bg-white/60 p-2">
              <p className="mb-2 text-center text-[9px] font-medium text-[#705394]">
                Shared workspace resources
              </p>
              <ProviderStack prefix="after" />
            </div>
          </div>
          <p className="mt-4 border-t border-[#ded4ef] pt-3 text-center text-[10px] text-[#6d6080]">
            Shared setup · personal accounts
          </p>
        </section>
      </div>
    </Figure>
  );
}

const scenarios = [
  "Allowed",
  "Project not approved",
  "Account disconnected",
] as const;

const accessRoutes: readonly (readonly SceneRoute[])[] = [0, 1, 2].map(
  (scenario) => [
    {
      id: "request-bundle",
      from: "request",
      to: "bundle",
      signals: [{ start: 0.3, end: 1 }],
    },
    {
      id: "bundle-rules",
      from: "bundle",
      to: "rules",
      signals: [{ start: 1.1, end: 1.8 }],
    },
    {
      id: "rules-account",
      from: "rules",
      to: "account",
      dashed: scenario === 1,
      tone: scenario === 1 ? ("amber" as const) : ("purple" as const),
      signals: scenario === 1 ? [] : [{ start: 1.9, end: 2.6 }],
    },
    {
      id: "account-resource",
      from: "account",
      to: "resource",
      dashed: scenario !== 0,
      tone: scenario === 2 ? ("amber" as const) : ("purple" as const),
      signals: scenario === 0 ? [{ start: 2.7, end: 3.4 }] : [],
    },
    ...(scenario === 0
      ? [
          {
            id: "result-return",
            from: "resource",
            to: "request",
            fromPort: "bottom" as const,
            toPort: "bottom" as const,
            verticalFrom: "left" as const,
            verticalTo: "left" as const,
            mobileGutter: 8,
            tone: "green" as const,
            signals: [{ start: 3.6, end: 4.6 }],
          },
        ]
      : []),
  ],
);

type GateState = "waiting" | "passed" | "blocked";

function Gate({
  node,
  icon,
  title,
  question,
  success,
  failure,
  state,
}: {
  node: string;
  icon: ReactNode;
  title: string;
  question: string;
  success: string;
  failure?: string;
  state: GateState;
}) {
  return (
    <div
      data-node={node}
      data-state={state}
      className={cn(
        "min-h-36 border bg-white p-3 text-center shadow-[0_9px_24px_rgba(30,25,50,0.055)] transition-colors duration-300",
        state === "waiting" && "border-[#ded9cf] text-[#8a8177]",
        state === "passed" && "border-[#75b894] bg-[#f2faf5]",
        state === "blocked" && "border-[#d59a55] bg-[#fff8ec]",
      )}
    >
      <span
        className={cn(
          "mx-auto grid size-8 place-items-center border",
          state === "passed" && "border-[#b4dbc4] bg-white text-[#28765a]",
          state === "blocked" && "border-[#e8c899] bg-white text-[#a06826]",
          state === "waiting" && "border-[#ded9cf] bg-[#f8f6f1] text-[#8a8177]",
        )}
      >
        {icon}
      </span>
      <strong className="mt-2 block text-[11px] font-semibold text-[#17151b]">
        {title}
      </strong>
      <span className="mt-1 block min-h-7 text-[9px] leading-snug text-[#82796c]">
        {question}
      </span>
      <span
        className={cn(
          "mt-2 inline-flex items-center gap-1 text-[10px] font-medium",
          state === "passed" && "text-[#28765a]",
          state === "blocked" && "text-[#9a6322]",
          state === "waiting" && "text-[#9c958c]",
        )}
      >
        {state === "passed" && <CheckIcon aria-hidden="true" />}
        {state === "blocked" && <XIcon aria-hidden="true" />}
        {state === "passed"
          ? success
          : state === "blocked"
            ? failure
            : "Waiting"}
      </span>
    </div>
  );
}

export function ControlScene() {
  const figureRef = useRef<HTMLElement>(null);
  const map = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const clock = useSceneClock(8, figureRef);
  const bundlePassed = clock.time >= 1;
  const rulesResolved = clock.time >= 1.8;
  const accountResolved = selected !== 1 && clock.time >= 2.6;
  const resourceReached = selected === 0 && clock.time >= 3.4;
  const gateState = (gate: "bundle" | "rules" | "account"): GateState => {
    if (gate === "bundle") return bundlePassed ? "passed" : "waiting";
    if (gate === "rules") {
      if (!rulesResolved) return "waiting";
      return selected === 1 ? "blocked" : "passed";
    }
    if (!accountResolved) return "waiting";
    return selected === 2 ? "blocked" : "passed";
  };
  return (
    <Figure
      name="control"
      figureRef={figureRef}
      clock={clock}
      caption="Change a bundle, workspace rule, or connection to stop future access."
      description="A request to search the Delivery project in Jira must pass the Research bundle, workspace rules, and the requesting person’s connected account. The selected scenario visibly stops the request at the check that blocks it."
    >
      <div
        role="group"
        aria-label="Access scenario"
        className="mb-6 flex flex-wrap gap-2"
      >
        {scenarios.map((scenario, index) => (
          <Button
            key={scenario}
            type="button"
            size="sm"
            variant={selected === index ? "secondary" : "ghost"}
            aria-pressed={selected === index}
            onClick={() => {
              setSelected(index);
              clock.restart();
            }}
          >
            {scenario}
          </Button>
        ))}
      </div>

      <div className="mb-3 hidden grid-cols-[1.15fr_1fr_1fr_1fr_.9fr] gap-5 text-center text-[9px] @min-[640px]/scene:grid">
        <span />
        <span className="col-span-2 border-t border-x border-[#c8b7e8] pt-1.5 font-medium text-[#6b4a9c]">
          Controlled by your team
        </span>
        <span className="border-t border-x border-[#d5cec3] pt-1.5 text-[#82796c]">
          Your personal permissions
        </span>
        <span />
      </div>

      <div
        ref={map}
        className={cn(
          mapStyle,
          "grid grid-cols-[1.15fr_1fr_1fr_1fr_.9fr] items-center gap-5 @max-[640px]/scene:flex @max-[640px]/scene:flex-col @max-[640px]/scene:gap-10 @max-[640px]/scene:pl-7",
        )}
      >
        <ScenePaths
          container={map}
          routes={accessRoutes[selected] ?? []}
          time={clock.time}
        />
        <div
          data-node="request"
          className="border border-[#bfaee2] bg-[#f0eafb] p-3 shadow-[0_9px_24px_rgba(73,48,221,0.08)] @max-[640px]/scene:w-full"
        >
          <p className="flex items-center gap-2 text-[9px] font-semibold tracking-wider text-[#6c479d] uppercase">
            <RobotIcon className="size-4" aria-hidden="true" /> Agent request
          </p>
          <strong className="mt-2 block text-xs leading-relaxed font-medium">
            Search the Delivery project in Jira
          </strong>
          {selected === 0 && resourceReached && (
            <span
              data-revealed={clock.time >= 4.6}
              className={cn(
                revealStyle,
                "mt-3 inline-flex items-center gap-1 bg-[#e5f1e9] px-2 py-1 text-[9px] text-[#28765a]",
              )}
            >
              <CheckIcon aria-hidden="true" /> Result returned
            </span>
          )}
        </div>
        <Gate
          node="bundle"
          icon={<PackageIcon aria-hidden="true" />}
          title="Research bundle"
          question="Is this tool included?"
          success="Jira included"
          state={gateState("bundle")}
        />
        <Gate
          node="rules"
          icon={<ShieldCheckIcon aria-hidden="true" />}
          title="Workspace rules"
          question="Are the project and action approved?"
          success="Project + search approved"
          failure="Project not approved"
          state={gateState("rules")}
        />
        <Gate
          node="account"
          icon={<KeyIcon aria-hidden="true" />}
          title="Your account"
          question="Are you connected and permitted?"
          success="Connected + permitted"
          failure="Connect your account"
          state={gateState("account")}
        />
        <div
          data-node="resource"
          data-reached={resourceReached}
          className={cn(
            "border p-3 text-center shadow-[0_9px_24px_rgba(30,25,50,0.055)] transition-colors duration-300 @max-[640px]/scene:w-full",
            resourceReached
              ? "border-[#75b894] bg-[#f2faf5]"
              : "border-[#ded9cf] bg-[#f2efe9] text-[#918a81]",
          )}
        >
          <ProviderMark
            provider="jira"
            displayName="Jira"
            size="sm"
            className="mx-auto size-7"
          />
          <strong className="mt-2 block text-[11px]">Delivery project</strong>
          <span className="mt-1 block text-[9px]">
            {resourceReached ? "Request allowed" : "Protected resource"}
          </span>
        </div>
      </div>
    </Figure>
  );
}

const usage = [
  { day: "Mon", success: 12, failed: 1 },
  { day: "Tue", success: 15, failed: 2 },
  { day: "Wed", success: 14, failed: 1 },
  { day: "Thu", success: 18, failed: 2 },
  { day: "Fri", success: 20, failed: 1 },
  { day: "Sat", success: 16, failed: 1 },
  { day: "Sun", success: 23, failed: 2 },
] as const;

export function ObserveScene() {
  const figureRef = useRef<HTMLElement>(null);
  const clock = useSceneClock(10, figureRef);
  const recorded = clock.time >= 4;
  return (
    <Figure
      name="observe"
      figureRef={figureRef}
      clock={clock}
      caption="Illustrative workspace activity"
      description="A seven-day chart shows 128 tool requests: 118 succeeded and 10 failed. Recent activity identifies Alex’s successful Jira search and Sam’s failed GitHub search."
    >
      <div className="border border-[#ded9cf] bg-white p-4 shadow-[0_12px_32px_rgba(30,25,50,0.065)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ebe6dd] pb-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#7564ad] uppercase">
              Tool requests · Last 7 days
            </p>
            <div className="mt-3 flex flex-wrap gap-6 tabular-nums">
              <div>
                <strong data-count="requests" className="block text-2xl">
                  {recorded ? 128 : 103}
                </strong>
                <span className="text-[9px] text-[#82796c]">Requests</span>
              </div>
              <div>
                <strong
                  data-count="succeeded"
                  className="block text-2xl text-[#28765a]"
                >
                  {recorded ? 118 : 95}
                </strong>
                <span className="text-[9px] text-[#82796c]">Succeeded</span>
              </div>
              <div>
                <strong
                  data-count="failed"
                  className="block text-2xl text-[#a06826]"
                >
                  {recorded ? 10 : 8}
                </strong>
                <span className="text-[9px] text-[#82796c]">Failed</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3 text-[9px] text-[#82796c]">
            <span className="flex items-center gap-1.5">
              <i className="size-2 bg-[#68ad87]" /> Succeeded
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-2 bg-[#d99a52]" /> Failed
            </span>
          </div>
        </div>

        <div
          className="mt-5 grid grid-cols-[24px_1fr] gap-3"
          aria-label="Daily request volume"
        >
          <div className="flex h-44 flex-col justify-between pb-5 text-right text-[8px] text-[#999188]">
            <span>30</span>
            <span>20</span>
            <span>10</span>
            <span>0</span>
          </div>
          <div className="relative grid h-44 grid-cols-7 items-end gap-2 border-b border-l border-[#d8d2c9] px-2 @max-[440px]/scene:gap-1">
            {["top-0", "top-1/3", "top-2/3"].map((position) => (
              <span
                key={position}
                className={cn(
                  "pointer-events-none absolute right-0 left-0 border-t border-dashed border-[#ece7df]",
                  position,
                )}
              />
            ))}
            {usage.map((item, index) => {
              const total = item.success + item.failed;
              const final = index === usage.length - 1;
              return (
                <div
                  key={item.day}
                  className="relative z-1 flex h-full flex-col justify-end text-center"
                >
                  <div
                    data-bar={item.day}
                    data-recorded={!final || recorded}
                    className="mx-auto flex w-full max-w-8 origin-bottom flex-col-reverse transition-transform duration-700 data-[recorded=false]:scale-y-0 motion-reduce:transition-none"
                    style={{ height: `${String((total / 30) * 100)}%` }}
                  >
                    <span
                      className="block bg-[#68ad87]"
                      style={{
                        height: `${String((item.success / total) * 100)}%`,
                      }}
                    />
                    <span
                      className="block bg-[#d99a52]"
                      style={{
                        height: `${String((item.failed / total) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="absolute top-full right-0 left-0 pt-1.5 text-[8px] text-[#82796c]">
                    {item.day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-9 border-t border-[#ebe6dd] pt-3">
          <div className="mb-2 grid grid-cols-[1fr_1.5fr_1fr_auto] gap-2 text-[8px] tracking-wider text-[#918a81] uppercase">
            <span>Who</span>
            <span>Tool</span>
            <span>Result</span>
            <span>When</span>
          </div>
          <div
            data-revealed={recorded}
            className={cn(
              revealStyle,
              "grid grid-cols-[1fr_1.5fr_1fr_auto] gap-2 border-t border-[#ebe6dd] bg-[#f3eefb] px-2 py-2.5 text-[10px]",
            )}
          >
            <span>Alex</span>
            <span className="flex items-center gap-1.5">
              <ProviderMark
                provider="jira"
                displayName="Jira"
                size="sm"
                className="size-4"
              />
              Jira search
            </span>
            <span className="text-[#28765a]">Succeeded</span>
            <span className="text-[#82796c]">Just now</span>
          </div>
          <div className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-2 border-t border-[#ebe6dd] px-2 py-2.5 text-[10px]">
            <span>Sam</span>
            <span className="flex items-center gap-1.5">
              <ProviderMark
                provider="github"
                displayName="GitHub"
                size="sm"
                className="size-4"
              />
              GitHub search
            </span>
            <span className="text-[#a06826]">Failed</span>
            <span className="text-[#82796c]">2 min ago</span>
          </div>
        </div>
      </div>
    </Figure>
  );
}

const updateEvents = [
  { provider: "jira", name: "Jira", message: "Email setup completed" },
  { provider: "github", name: "GitHub", message: "Invite-flow PR merged" },
  {
    provider: "confluence",
    name: "Confluence",
    message: "Launch notes updated",
  },
] as const;

const updateRoutes: readonly SceneRoute[] = updateEvents.flatMap(
  (event, index) => [
    {
      id: `${event.provider}-in`,
      from: `event-${event.provider}`,
      to: "updates-core",
      signals: [{ start: 0.3 + index * 1.7, end: 1 + index * 1.7 }],
    },
    {
      id: `${event.provider}-teams`,
      from: "updates-core",
      to: "teams",
      signals: [{ start: 1 + index * 1.7, end: 1.7 + index * 1.7 }],
    },
  ],
);

const updatesRoutes: readonly SceneRoute[] = [
  ...updateRoutes,
  {
    id: "daily-digest",
    from: "updates-core",
    to: "digest",
    dashed: true,
    signals: [{ start: 6, end: 7.2 }],
  },
];

export function UpdatesScene() {
  const figureRef = useRef<HTMLElement>(null);
  const map = useRef<HTMLDivElement>(null);
  const clock = useSceneClock(12, figureRef);
  return (
    <Figure
      name="updates"
      figureRef={figureRef}
      clock={clock}
      caption="Subscribed events arrive now. The email digest arrives later."
      description="Updates from Jira, GitHub, and Confluence flow through Context Layer. Individual subscribed events appear in Teams, while a once-daily email digest summarises all three later that day."
    >
      <div
        ref={map}
        className={cn(
          mapStyle,
          "grid grid-cols-[1fr_110px_1.45fr] items-center gap-8 @max-[640px]/scene:flex @max-[640px]/scene:flex-col @max-[640px]/scene:gap-10 @max-[640px]/scene:pl-7",
        )}
      >
        <ScenePaths container={map} routes={updatesRoutes} time={clock.time} />
        <div className="flex w-full flex-col gap-3">
          <p className="text-[9px] font-semibold tracking-wider text-[#82796c] uppercase">
            Updates from your tools
          </p>
          {updateEvents.map((event) => (
            <ProviderNode
              key={event.provider}
              provider={event.provider}
              name={event.name}
              node={`event-${event.provider}`}
              detail={event.message}
            />
          ))}
        </div>

        <Core node="updates-core" />

        <div className="flex w-full min-w-0 flex-col gap-4">
          <div
            data-node="teams"
            className="border border-[#cfc2ed] bg-white shadow-[0_12px_30px_rgba(73,48,221,0.08)]"
          >
            <div className="flex items-center justify-between border-b border-[#e7e0ee] bg-[#f1ecf9] px-3 py-2">
              <strong className="flex items-center gap-2 text-[11px]">
                <ProviderMark
                  provider="teams"
                  displayName="Teams"
                  size="sm"
                  className="size-5"
                />
                Teams · #engineering
              </strong>
              <span className="text-[8px] text-[#7454a0]">
                Subscribed updates
              </span>
            </div>
            <div className="space-y-2 p-3">
              {updateEvents.map((event, index) => (
                <div
                  key={event.provider}
                  data-message={event.provider}
                  data-revealed={clock.time >= 1.7 + index * 1.7}
                  className={cn(
                    revealStyle,
                    "flex items-center gap-2 border border-[#ebe6ef] bg-[#faf8fc] px-2.5 py-2",
                  )}
                >
                  <ProviderMark
                    provider={event.provider}
                    displayName={event.name}
                    size="sm"
                    className="size-5 shrink-0"
                  />
                  <span className="min-w-0 text-[10px]">
                    <strong className="block font-medium">{event.name}</strong>
                    <span className="block truncate text-[#82796c]">
                      {event.message}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            data-node="digest"
            className="border border-[#ded9cf] bg-white p-3 shadow-[0_9px_24px_rgba(30,25,50,0.055)]"
          >
            <div className="flex items-center justify-between gap-3">
              <strong className="flex items-center gap-2 text-[11px]">
                <EnvelopeSimpleIcon
                  className="size-5 text-[#7950ad]"
                  aria-hidden="true"
                />
                Daily email digest
              </strong>
              <span className="text-[8px] text-[#82796c]">Later that day</span>
            </div>
            <div
              data-revealed={clock.time >= 7.2}
              className={cn(
                revealStyle,
                "mt-3 flex items-center justify-between gap-2 border-t border-[#ebe6dd] pt-3",
              )}
            >
              <div className="flex -space-x-1">
                {updateEvents.map((event) => (
                  <ProviderMark
                    key={event.provider}
                    provider={event.provider}
                    displayName={event.name}
                    size="sm"
                    className="size-5 border border-white"
                  />
                ))}
              </div>
              <span className="text-[9px] text-[#6f675e]">
                3 updates from your workspace
              </span>
            </div>
          </div>
        </div>
      </div>
    </Figure>
  );
}
