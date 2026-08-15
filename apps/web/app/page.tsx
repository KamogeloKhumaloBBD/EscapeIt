import {
  ArrowRightIcon,
  ChartLineIcon,
  CheckCircleIcon,
  EnvelopeSimpleIcon,
  KeyIcon,
  PackageIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import {
  AuthControl,
  AuthControlSkeleton,
} from "@/components/auth/auth-control";
import { BrandIcon } from "@/components/brand-icon";
import { ProviderMark } from "@/components/integrations/provider-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const connectedSources = [
  {
    detail: "In review",
    displayName: "Jira",
    provider: "jira",
    result: "ENG-184",
  },
  {
    detail: "Checks passed",
    displayName: "GitHub",
    provider: "github",
    result: "PR #482",
  },
  {
    detail: "3 steps complete",
    displayName: "Confluence",
    provider: "confluence",
    result: "Rollout plan",
  },
  {
    detail: "12 commits",
    displayName: "Bitbucket",
    provider: "bitbucket",
    result: "release/2.4",
  },
] as const;

const connectionSteps = [
  "Personal account",
  "Workspace resource",
  "Allowed scopes",
  "Enabled MCP tools",
] as const;

function LandingAuthControl() {
  return (
    <Suspense fallback={<AuthControlSkeleton />}>
      <AuthControl />
    </Suspense>
  );
}

function VisualFrame({
  children,
  description,
}: {
  children: ReactNode;
  description: string;
}) {
  return (
    <figure className="relative min-w-0">
      <figcaption className="sr-only">{description}</figcaption>
      <div aria-hidden="true">{children}</div>
    </figure>
  );
}

function HeroWorkflow() {
  return (
    <VisualFrame description="An illustrative coding agent asks whether Jira issue ENG-184 can ship. Context Layer checks your identity, the Delivery bundle, allowed resources, and enabled tools while gathering context from Jira, GitHub, Confluence, and Bitbucket.">
      <div className="landing-orbit-shell relative mx-auto h-[470px] w-full max-w-[610px] sm:h-[540px]">
        <div className="landing-orbit absolute left-1/2 top-0 h-[540px] w-[610px] -translate-x-1/2">
          <div className="landing-orbit-ring" />
          <svg
            className="absolute inset-0 size-full overflow-visible"
            viewBox="0 0 610 540"
          >
            <path
              className="landing-orbit-path landing-orbit-path--agent"
              d="M116 72 C188 78 174 184 243 219"
              pathLength="1"
            />
            <path
              className="landing-orbit-path landing-orbit-path--jira"
              d="M488 84 C415 90 431 185 359 221"
              pathLength="1"
            />
            <path
              className="landing-orbit-path landing-orbit-path--github"
              d="M523 276 C446 276 432 271 374 270"
              pathLength="1"
            />
            <path
              className="landing-orbit-path landing-orbit-path--confluence"
              d="M97 403 C166 380 166 330 241 299"
              pathLength="1"
            />
            <path
              className="landing-orbit-path landing-orbit-path--bitbucket"
              d="M305 315 C305 360 305 420 305 475"
              pathLength="1"
            />
          </svg>

          <div className="landing-orbit-agent absolute left-[1%] top-[6%] flex items-center gap-3 border border-[#dcd7cc] bg-white px-4 py-3 shadow-[0_14px_40px_rgba(30,25,50,0.1)]">
            <span className="grid size-9 place-items-center bg-[#17151b] text-xs font-semibold text-white">
              AI
            </span>
            <span>
              <span className="block text-[0.625rem] font-medium tracking-[0.12em] text-[#817a71] uppercase">
                Coding agent
              </span>
              <span className="mt-0.5 block text-sm font-semibold">
                Can ENG-184 ship?
              </span>
            </span>
          </div>

          {connectedSources.map((source, index) => (
            <div
              className={`landing-orbit-source landing-orbit-source--${source.provider} absolute flex items-center gap-2.5 border border-[#ded9cf] bg-white px-3 py-2.5 shadow-[0_12px_35px_rgba(30,25,50,0.09)]`}
              key={source.provider}
              style={{ animationDelay: `${String(index * -0.8)}s` }}
            >
              <ProviderMark
                displayName={source.displayName}
                provider={source.provider}
                size="sm"
              />
              <span>
                <span className="block text-xs font-semibold">
                  {source.result}
                </span>
                <span className="block text-[0.625rem] text-[#777067]">
                  {source.detail}
                </span>
              </span>
            </div>
          ))}

          <div className="landing-orbit-core absolute left-1/2 top-1/2 w-[246px] -translate-x-1/2 -translate-y-1/2 border border-[#29242f] bg-[#17151b] p-5 text-white shadow-[0_28px_70px_rgba(42,32,76,0.24)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrandIcon className="size-5" />
                <span className="text-xs font-semibold">Context Layer</span>
              </div>
              <span className="flex items-center gap-1.5 text-[0.625rem] text-[#b9b3c5]">
                <span className="landing-status-pulse size-1.5 rounded-full bg-[#8cffbd]" />
                Secured
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[0.625rem] text-[#d5d0dc]">
              <span className="border border-white/10 bg-white/[0.045] px-2 py-1.5">
                Identity ✓
              </span>
              <span className="border border-white/10 bg-white/[0.045] px-2 py-1.5">
                Bundle ✓
              </span>
              <span className="border border-white/10 bg-white/[0.045] px-2 py-1.5">
                Scopes ✓
              </span>
              <span className="border border-white/10 bg-white/[0.045] px-2 py-1.5">
                Tools ✓
              </span>
            </div>
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}

function ConnectionVisual() {
  const providers = [
    { displayName: "Jira", provider: "jira" },
    { displayName: "GitHub", provider: "github" },
    { displayName: "Confluence", provider: "confluence" },
  ] as const;

  return (
    <VisualFrame description="Jira, GitHub, and Confluence converge into Context Layer. A four-step pipeline confirms the member's personal account, workspace resource, allowed scopes, and enabled MCP tools.">
      <div className="landing-feature-scene landing-connect-scene relative mx-auto min-h-[430px] max-w-xl overflow-hidden border border-[#dcd7cc] bg-[#f8f6f1] p-5 shadow-[0_22px_65px_rgba(44,37,63,0.1)] sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <span className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-[#777067] uppercase">
            Workspace sources
          </span>
          <Badge className="border-emerald-600/20 bg-emerald-50 text-emerald-700">
            3 connected
          </Badge>
        </div>

        <div className="relative mt-8 grid grid-cols-3 gap-3">
          <div className="landing-connect-bus absolute top-[1.15rem] right-[16%] left-[16%] h-px" />
          {providers.map((provider, index) => (
            <div
              className="landing-connect-provider relative z-10 flex flex-col items-center gap-2"
              key={provider.provider}
              style={{ animationDelay: `${String(index * 180)}ms` }}
            >
              <span className="grid size-12 place-items-center border border-[#ded9cf] bg-white shadow-[0_8px_24px_rgba(30,25,50,0.08)] sm:size-14">
                <ProviderMark
                  displayName={provider.displayName}
                  provider={provider.provider}
                  size="sm"
                />
              </span>
              <span className="text-[0.625rem] font-semibold sm:text-xs">
                {provider.displayName}
              </span>
            </div>
          ))}
        </div>

        <div className="landing-connect-stem mx-auto h-10 w-px" />

        <div className="landing-connect-core relative mx-auto flex w-fit items-center gap-3 border border-[#29242f] bg-[#17151b] px-5 py-3.5 text-white shadow-[0_16px_38px_rgba(42,32,76,0.2)]">
          <BrandIcon className="size-6" />
          <span>
            <span className="block text-xs font-semibold">Context Layer</span>
            <span className="mt-0.5 block text-[0.625rem] text-[#aaa3b7]">
              One MCP endpoint
            </span>
          </span>
          <span className="landing-status-pulse ml-2 size-1.5 rounded-full bg-[#8cffbd]" />
        </div>

        <div className="landing-connect-stem mx-auto h-9 w-px" />

        <div className="grid grid-cols-2 gap-2">
          {connectionSteps.map((step, index) => (
            <div
              className="landing-connect-step flex items-center gap-2 border border-[#ded9cf] bg-white px-3 py-2.5"
              key={step}
              style={{ animationDelay: `${String(500 + index * 240)}ms` }}
            >
              <CheckCircleIcon
                className="size-4 shrink-0 text-emerald-600"
                weight="fill"
              />
              <span className="min-w-0 text-[0.625rem] font-medium sm:text-xs">
                {step}
              </span>
            </div>
          ))}
        </div>

        <div className="landing-connect-ready mt-4 flex items-center justify-between border-t border-[#ded9cf] pt-4 text-xs text-[#777067]">
          <span>Connected</span>
          <span className="font-mono text-[#5a41e8]">READY · 15 TOOLS</span>
        </div>
      </div>
    </VisualFrame>
  );
}

function BundleVisual() {
  const providers = [
    {
      className: "left-[7%] top-[44%]",
      displayName: "Jira",
      included: true,
      provider: "jira",
    },
    {
      className: "right-[7%] top-[44%]",
      displayName: "GitHub",
      included: true,
      provider: "github",
    },
    {
      className: "bottom-[7%] left-[23%]",
      displayName: "Confluence",
      included: true,
      provider: "confluence",
    },
    {
      className: "right-[3%] bottom-[3%]",
      displayName: "Bitbucket",
      included: false,
      provider: "bitbucket",
    },
  ] as const;

  return (
    <VisualFrame description="An illustrative access map shows your coding-agent token limited to a Delivery bundle containing Jira, GitHub, and Confluence. Bitbucket is outside the bundle and unavailable to that agent.">
      <div className="landing-feature-scene landing-boundary-scene relative mx-auto h-[430px] max-w-xl overflow-hidden border border-[#dcd7cc] bg-[#f8f6f1] shadow-[0_22px_65px_rgba(44,37,63,0.1)]">
        <div className="absolute top-5 left-5 z-20 flex items-center gap-2 border border-[#29242f] bg-[#17151b] px-3 py-2 text-white shadow-lg">
          <span className="grid size-7 place-items-center bg-white/10 text-[0.625rem] font-semibold">
            AI
          </span>
          <span>
            <span className="block text-[0.625rem] font-semibold">
              Coding agent
            </span>
            <span className="block text-[0.5625rem] text-[#aaa3b7]">
              Your token
            </span>
          </span>
          <KeyIcon className="ml-1 size-3.5 text-[#9d8cff]" />
        </div>

        <span className="absolute top-6 right-5 z-20 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-[#777067] uppercase">
          Access boundary
        </span>

        <div className="landing-boundary absolute inset-[14%_9%_12%] border border-dashed border-[#9d8cff] bg-[#f1eeff]/45" />
        <div className="landing-boundary-ring absolute top-1/2 left-1/2 size-[215px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#bfb5fb]" />

        <svg className="absolute inset-0 size-full" viewBox="0 0 560 430">
          <path
            className="landing-bundle-route"
            d="M112 62 C165 95 195 130 236 177"
            pathLength="1"
          />
          <path
            className="landing-bundle-route"
            d="M250 215 C190 220 145 235 102 250"
            pathLength="1"
          />
          <path
            className="landing-bundle-route"
            d="M310 215 C370 220 415 235 458 250"
            pathLength="1"
          />
          <path
            className="landing-bundle-route"
            d="M275 250 C260 300 215 332 175 356"
            pathLength="1"
          />
        </svg>

        <div className="landing-bundle-core absolute top-1/2 left-1/2 z-10 grid size-[132px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#6f59ee] bg-[#17151b] p-5 text-center text-white shadow-[0_20px_55px_rgba(73,48,221,0.28)]">
          <span>
            <PackageIcon
              className="mx-auto size-6 text-[#9d8cff]"
              weight="fill"
            />
            <span className="mt-2 block text-xs font-semibold">
              Delivery bundle
            </span>
            <span className="mt-1 block text-[0.5625rem] text-[#aaa3b7]">
              3 providers
            </span>
          </span>
        </div>

        {providers.map((provider, index) => (
          <div
            className={`landing-bundle-node absolute z-10 flex items-center gap-2 border px-2.5 py-2 shadow-[0_8px_24px_rgba(30,25,50,0.08)] ${provider.className} ${
              provider.included
                ? "border-[#ded9cf] bg-white"
                : "border-dashed border-[#c7c0b6] bg-[#f2f0eb] opacity-55"
            }`}
            key={provider.provider}
            style={{ animationDelay: `${String(index * 260)}ms` }}
          >
            <ProviderMark
              displayName={provider.displayName}
              provider={provider.provider}
              size="sm"
            />
            <span className="hidden sm:block">
              <span className="block text-[0.625rem] font-semibold">
                {provider.displayName}
              </span>
              <span className="block text-[0.5625rem] text-[#777067]">
                {provider.included ? "Available" : "Outside bundle"}
              </span>
            </span>
          </div>
        ))}

        <span className="absolute bottom-5 left-5 font-mono text-[0.5625rem] text-[#777067]">
          RESOURCES ∩ TOOLS ∩ IDENTITY
        </span>
      </div>
    </VisualFrame>
  );
}

function OperationsVisual() {
  const activity = [
    { displayName: "Jira", label: "ENG-184 status", provider: "jira" },
    { displayName: "GitHub", label: "PR #482 checks", provider: "github" },
    {
      displayName: "Confluence",
      label: "Rollout plan",
      provider: "confluence",
    },
  ] as const;

  return (
    <VisualFrame description="An illustrative workspace signal shows 1,284 tool calls, a 99.4 percent success rate, recent Jira, GitHub, and Confluence activity, and a daily digest delivered to Microsoft Teams.">
      <div className="landing-feature-scene landing-operations-scene relative mx-auto min-h-[430px] max-w-xl overflow-hidden border border-[#dcd7cc] bg-[#17151b] p-5 text-white shadow-[0_22px_65px_rgba(44,37,63,0.14)] sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ChartLineIcon className="size-4 text-[#9d8cff]" />
            <span className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-[#c4bdcf] uppercase">
              Workspace signal
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-[0.625rem] text-[#aaa3b7]">
            <span className="landing-status-pulse size-1.5 rounded-full bg-[#8cffbd]" />
            Live
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div>
            <p className="text-3xl font-semibold tracking-[-0.05em]">1,284</p>
            <p className="mt-1 text-[0.625rem] tracking-wide text-[#938ca0] uppercase">
              Tool calls
            </p>
          </div>
          <div>
            <p className="text-3xl font-semibold tracking-[-0.05em]">99.4%</p>
            <p className="mt-1 text-[0.625rem] tracking-wide text-[#938ca0] uppercase">
              Success rate
            </p>
          </div>
        </div>

        <div className="landing-signal-chart mt-6 flex h-20 items-end gap-1.5 border-b border-white/15 pb-px">
          {[36, 52, 45, 68, 56, 74, 63, 88, 72, 94, 82, 100].map(
            (height, index) => (
              <span
                className="landing-signal-bar flex-1 bg-[#806cf2]"
                key={`${String(height)}-${String(index)}`}
                style={{
                  animationDelay: `${String(index * 90)}ms`,
                  height: `${String(height)}%`,
                }}
              />
            ),
          )}
        </div>

        <div className="relative mt-6">
          <div className="landing-activity-line absolute top-4 bottom-4 left-[17px] w-px" />
          <div className="space-y-2">
            {activity.map((item, index) => (
              <div
                className="landing-activity-item relative z-10 flex items-center gap-3 border border-white/10 bg-white/[0.055] px-2.5 py-2"
                key={item.provider}
                style={{ animationDelay: `${String(index * 320)}ms` }}
              >
                <ProviderMark
                  displayName={item.displayName}
                  provider={item.provider}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#e4dfea]">
                  {item.label}
                </span>
                <CheckCircleIcon
                  className="size-3.5 shrink-0 text-[#8cffbd]"
                  weight="fill"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="landing-digest mt-4 flex items-center gap-3 border border-[#9d8cff]/55 bg-[#5a41e8]/20 p-3">
          <span className="grid size-8 shrink-0 place-items-center bg-[#806cf2] text-white">
            <EnvelopeSimpleIcon className="size-4" weight="fill" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">
              Daily digest delivered
            </span>
            <span className="mt-0.5 block text-[0.625rem] text-[#bbb4c8]">
              Microsoft Teams · Delivery channel
            </span>
          </span>
          <CheckCircleIcon
            className="size-4 shrink-0 text-[#8cffbd]"
            weight="fill"
          />
        </div>
      </div>
    </VisualFrame>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfaf7] text-[#15130f]">
      <div className="hero-surface">
        <header className="relative z-20 mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
          >
            <BrandIcon className="size-6" />
            Context Layer
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-4">
            <Link
              className="text-sm text-[#68635a] underline-offset-4 hover:text-[#15130f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
              href="/pricing"
            >
              Pricing
            </Link>
            <LandingAuthControl />
          </div>
        </header>

        <section className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-6 pb-24 pt-12 lg:min-h-[760px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:px-8 lg:pb-28 lg:pt-10">
          <div className="mx-auto w-full min-w-0 max-w-[calc(100vw-3rem)] text-center lg:mx-0 lg:max-w-[660px] lg:text-left">
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.07em] sm:text-6xl lg:text-[4.75rem]">
              Bring Context To Where The Work Happens
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-8 text-[#68635a] sm:text-xl lg:mx-0">
              A universal context layer that empowers your agents with secure
              access to the tools you use to get your work done.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start [&_[data-slot=button]]:h-11 [&_[data-slot=button]]:px-7">
              <Button asChild size="lg" variant="outline">
                <Link href="#features">
                  See how it works
                  <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
                </Link>
              </Button>
            </div>
            <p className="mt-5 text-xs text-[#817a71]">
              Works with Jira, GitHub, Bitbucket, Confluence, and Microsoft
              Teams.
            </p>
          </div>

          <HeroWorkflow />
        </section>
      </div>

      <section className="border-y border-[#dedbd2] bg-white/55" id="features">
        <div className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold tracking-[0.16em] text-[#5a41e8] uppercase">
              One layer. Three jobs.
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">
              From connected tools to controlled, observable context.
            </h2>
          </div>

          <div className="mt-20 space-y-24 lg:mt-28 lg:space-y-32">
            <article className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
              <div className="max-w-lg">
                <span className="font-mono text-xs font-semibold text-[#5a41e8]">
                  01 / CONNECT
                </span>
                <h3 className="mt-5 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  Connect the tools where work already lives.
                </h3>
                <p className="mt-5 text-lg leading-8 text-[#68635a]">
                  Bring Jira, GitHub, Bitbucket, and Confluence into one MCP
                  endpoint. Provider accounts stay personal, while owners choose
                  the workspace resources and tools agents can use.
                </p>
              </div>
              <ConnectionVisual />
            </article>

            <article className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
              <div className="lg:order-2 lg:pl-8">
                <span className="font-mono text-xs font-semibold text-[#5a41e8]">
                  02 / CONTROL
                </span>
                <h3 className="mt-5 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  Set the boundary once. Every agent stays inside it.
                </h3>
                <p className="mt-5 text-lg leading-8 text-[#68635a]">
                  Allowlist projects, repositories, and spaces; select read or
                  write tools; then package the right providers into bundles for
                  each agent connection.
                </p>
              </div>
              <div className="lg:order-1">
                <BundleVisual />
              </div>
            </article>

            <article className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
              <div className="max-w-lg">
                <span className="font-mono text-xs font-semibold text-[#5a41e8]">
                  03 / OPERATE
                </span>
                <h3 className="mt-5 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  Know what agents used—and keep the team in sync.
                </h3>
                <p className="mt-5 text-lg leading-8 text-[#68635a]">
                  Track tool usage, reliability, and recent activity. Turn
                  provider events into focused Microsoft Teams notifications and
                  daily workspace digests.
                </p>
              </div>
              <OperationsVisual />
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 py-20 text-center lg:px-8 lg:py-28">
        <h2 className="text-balance text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Give every agent the right context.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#68635a]">
          Connect your workspace, choose what is accessible, and start using
          Context Layer from the coding tools your team already prefers.
        </p>
        <div className="mt-8 flex justify-center [&_[data-slot=button]]:h-11 [&_[data-slot=button]]:px-8">
          <LandingAuthControl />
        </div>
      </section>

      <footer className="border-t border-[#dedbd2]">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-[#68635a] lg:px-8">
          <Link
            className="flex items-center gap-2 font-semibold text-[#15130f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
            href="/"
          >
            <BrandIcon className="size-5" />
            Context Layer
          </Link>
          <div className="flex items-center gap-5">
            <Link
              className="underline-offset-4 hover:text-[#15130f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
              href="/pricing"
            >
              Pricing
            </Link>
            <Link
              className="underline-offset-4 hover:text-[#15130f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
              href="/privacy"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
