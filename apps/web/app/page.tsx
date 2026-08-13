import {
  BookOpenText,
  Bot,
  GitPullRequest,
  MessageSquareText,
  TicketCheck,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import {
  AuthControl,
  AuthControlSkeleton,
} from "@/components/auth/auth-control";

const sources = [
  {
    className: "context-source--jira",
    detail: "Issue ENG-184",
    icon: TicketCheck,
    name: "Jira",
  },
  {
    className: "context-source--github",
    detail: "2 related PRs",
    icon: GitPullRequest,
    name: "GitHub",
  },
  {
    className: "context-source--confluence",
    detail: "3 matching pages",
    icon: BookOpenText,
    name: "Confluence",
  },
  {
    className: "context-source--teams",
    detail: "Delivery ready",
    icon: MessageSquareText,
    name: "Teams",
  },
] as const;

function ContextFlow() {
  return (
    <div
      aria-label="A coding agent requesting connected work context from Context Layer"
      className="context-visual-shell relative mx-auto h-[520px] w-full max-w-[590px]"
      role="img"
    >
      <div
        aria-hidden="true"
        className="context-visual absolute left-1/2 top-0 h-[520px] w-[590px] -translate-x-1/2"
      >
        <div className="context-orbit" />

        <svg
          className="absolute inset-0 size-full overflow-visible"
          viewBox="0 0 590 520"
        >
          <path
            className="context-path context-path--in"
            d="M112 72 C178 74 175 196 244 226"
            pathLength="1"
          />
          <path
            className="context-path context-path--one"
            d="M482 86 C410 94 424 190 348 224"
            pathLength="1"
          />
          <path
            className="context-path context-path--two"
            d="M520 252 C440 250 431 260 365 260"
            pathLength="1"
          />
          <path
            className="context-path context-path--three"
            d="M458 432 C410 389 419 327 350 294"
            pathLength="1"
          />
          <path
            className="context-path context-path--four"
            d="M91 414 C161 389 164 322 239 292"
            pathLength="1"
          />
          <path
            className="context-path context-path--out"
            d="M294 310 C294 352 294 374 294 412"
            pathLength="1"
          />
        </svg>

        <div className="context-agent absolute left-[2%] top-[7%] flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_14px_40px_rgba(30,25,50,0.1)]">
          <span className="grid size-9 place-items-center rounded-xl bg-[#ece9ff] text-[#4930dd]">
            <Bot aria-hidden="true" className="size-[18px]" />
          </span>
          <span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[#8a8492]">
              Coding agent
            </span>
            <span className="mt-0.5 block text-sm font-semibold">
              Get ENG-184 context
            </span>
          </span>
        </div>

        {sources.map(({ className, detail, icon: Icon, name }) => (
          <div
            className={`context-source ${className} absolute flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 shadow-[0_12px_35px_rgba(30,25,50,0.09)]`}
            key={name}
          >
            <Icon aria-hidden="true" className="size-4 text-[#4930dd]" />
            <span>
              <span className="block text-xs font-semibold">{name}</span>
              <span className="block text-[10px] text-[#85808b]">{detail}</span>
            </span>
          </div>
        ))}

        <div className="context-core absolute left-1/2 top-1/2 w-[230px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] bg-[#17151b] p-5 text-white shadow-[0_28px_70px_rgba(42,32,76,0.24)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-[-0.01em]">
              Context Layer
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-[#b9b3c5]">
              <span className="context-pulse size-1.5 rounded-full bg-[#8cffbd]" />
              Live
            </span>
          </div>
          <div className="mt-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#938ca0]">
              get_work_context
            </p>
            <p className="mt-2 text-lg font-medium tracking-[-0.03em]">
              Evidence connected.
            </p>
            <div className="mt-5 flex gap-1.5" aria-hidden="true">
              <span className="h-1.5 w-12 rounded-full bg-[#5a41e8]" />
              <span className="h-1.5 w-8 rounded-full bg-[#8a77f2]" />
              <span className="h-1.5 w-5 rounded-full bg-[#b5a9fa]" />
              <span className="h-1.5 w-3 rounded-full bg-[#ded8ff]" />
            </div>
          </div>
        </div>

        <div className="context-response absolute bottom-[1%] left-1/2 w-[265px] -translate-x-1/2 rounded-2xl bg-white px-4 py-3 shadow-[0_14px_40px_rgba(30,25,50,0.1)]">
          <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.1em] text-[#817b87]">
            <span>Context returned</span>
            <span>842 ms</span>
          </div>
          <p className="mt-1.5 text-xs font-medium text-[#29262e]">
            Issue · pull requests · docs · evidence
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfaf7] text-[#15130f]">
      <div className="hero-surface">
        <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
          >
            Context Layer
          </Link>
          <Suspense fallback={<AuthControlSkeleton />}>
            <AuthControl />
          </Suspense>
        </header>

        <section className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 px-6 pb-20 pt-14 lg:min-h-[680px] lg:grid-cols-[1fr_1fr] lg:gap-8 lg:px-8 lg:pb-24 lg:pt-8">
          <div className="max-w-[650px] text-center lg:text-left">
            <h1 className="text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.075em] sm:text-[clamp(3.5rem,6vw,5.75rem)]">
              Bring Context to Where The Work Happens
            </h1>

            <p className="mx-auto mt-7 max-w-xl text-pretty text-lg leading-8 text-[#68635a] sm:text-xl lg:mx-0">
              A universal context layer for coding agents.
            </p>

            <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <Suspense fallback={<AuthControlSkeleton />}>
                <AuthControl />
              </Suspense>
            </div>
          </div>

          <ContextFlow />
        </section>
      </div>
    </main>
  );
}
