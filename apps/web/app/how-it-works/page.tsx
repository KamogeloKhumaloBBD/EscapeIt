import { ArrowDownIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandIcon } from "@/components/brand-icon";
import {
  ConnectScene,
  ControlScene,
  ObserveScene,
  UpdatesScene,
} from "@/components/how-it-works/scenes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const description =
  "See how Context Layer replaces repeated agent setup with one endpoint, checks every request, tracks tool usage, and delivers updates where your team works.";
export const metadata: Metadata = {
  title: "How it works | Context Layer",
  description,
  openGraph: {
    title: "How it works | Context Layer",
    description,
    url: "/how-it-works",
  },
  twitter: { title: "How it works | Context Layer", description },
};
const container =
  "mx-auto w-[calc(100%-2rem)] max-w-[84rem] sm:w-[calc(100%-4rem)]";
const sections = [
  { id: "connect", label: "Connect" },
  { id: "control", label: "Control" },
  { id: "observe", label: "Observe" },
  { id: "stay-updated", label: "Stay updated" },
];
function Section({
  id,
  title,
  copy,
  children,
  reverse = false,
}: {
  id: string;
  title: string;
  copy: string;
  children: ReactNode;
  reverse?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "grid scroll-mt-32 items-center gap-10 border-t border-[#e8e3da] py-16 sm:scroll-mt-24 sm:py-24 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] xl:gap-16",
        reverse &&
          "xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] xl:[&>figure]:col-start-1 xl:[&>figure]:row-start-1 xl:[&>div]:col-start-2",
      )}
    >
      <div className="max-w-xl">
        <h2
          id={`${id}-title`}
          className="text-4xl leading-[1.1] font-semibold tracking-[-0.045em] text-balance sm:text-5xl xl:text-[2.75rem]"
        >
          {title}
        </h2>
        <p className="mt-6 text-base leading-relaxed text-pretty text-[#6f675e]">
          {copy}
        </p>
      </div>
      {children}
    </section>
  );
}
export default function HowItWorksPage() {
  return (
    <div
      id="top"
      data-how-it-works-page
      className="bg-[#fbfaf7] text-[#17151b] [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-[#6f55e8] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-4 [&_button:focus-visible]:outline-[#6f55e8]"
    >
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4"
        href="#main-content"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-[#e8e3da] bg-[#fbfaf7]/95 backdrop-blur-sm">
        <div
          className={cn(
            container,
            "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-3 py-4 sm:grid-cols-[1fr_auto_1fr]",
          )}
        >
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <BrandIcon className="size-6" />
            Context Layer
          </Link>
          <nav
            aria-label="Explainer sections"
            className="order-3 col-span-2 flex justify-between border-t border-[#e8e3da] pt-3 sm:order-none sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:justify-center sm:gap-9 sm:border-0 sm:pt-0 lg:gap-12"
          >
            {sections.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-xs font-semibold whitespace-nowrap text-[#756e65] hover:text-[#5a41e8] sm:text-sm"
              >
                {label}
              </a>
            ))}
          </nav>
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-1 justify-self-end sm:col-start-3 sm:row-start-1"
          >
            <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
              <Link href="/">Home</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-in">
                Get started <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main-content">
        <section
          id="connect"
          aria-labelledby="connect-title"
          className="scroll-mt-32 bg-[radial-gradient(ellipse_at_75%_45%,#eee8ff90,transparent_58%)] sm:scroll-mt-24"
        >
          <div
            className={cn(
              container,
              "grid items-center gap-10 pt-10 pb-14 sm:py-16 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] xl:gap-16",
            )}
          >
            <div className="max-w-xl">
              <h1
                id="connect-title"
                className="text-[2.75rem] leading-[1.05] font-semibold tracking-[-0.055em] text-balance sm:text-6xl xl:text-[3.3rem]"
              >
                Connect once.{" "}
                <span className="text-[#5a41e8]">Share the setup.</span>
              </h1>
              <p className="mt-6 text-base leading-relaxed text-pretty text-[#6f675e]">
                Manage your MCP connections in one place, then bring the same
                approved tools to your team across their AI clients.
              </p>
              <Button asChild variant="default" className="mt-7">
                <a href="#control">
                  See how it works <ArrowDownIcon aria-hidden="true" />
                </a>
              </Button>
            </div>
            <ConnectScene />
          </div>
        </section>
        <div className={container}>
          <Section
            id="control"
            title="Control every request."
            copy="Bundles choose the tools an agent needs. Workspace rules control resources and actions. Personal permissions decide what that person can access."
            reverse
          >
            <ControlScene />
          </Section>
          <Section
            id="observe"
            title="See usage and outcomes at a glance."
            copy="Track how often tools are used, who used them, and which requests succeeded or failed."
          >
            <ObserveScene />
          </Section>
          <Section
            id="stay-updated"
            title="Stay informed where you work."
            copy="Subscribe to provider events once. Context Layer sends updates to Teams and a daily summary to your inbox."
            reverse
          >
            <UpdatesScene />
          </Section>
          <section
            aria-label="Explore Context Layer"
            className="border-t border-[#e8e3da] py-20 text-center"
          >
            <BrandIcon className="mx-auto mb-6 size-9" />
            <h2 className="text-3xl leading-snug font-semibold tracking-tight text-balance sm:text-4xl">
              One endpoint. Controlled access.
              <br />
              <span className="text-[#82796c]">
                Visible activity. Stay informed.
              </span>
            </h2>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/sign-in">
                  Get started <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href="#top">Back to top</a>
              </Button>
            </div>
          </section>
        </div>
      </main>
      <footer
        className={cn(
          container,
          "flex flex-wrap justify-between gap-4 border-t border-[#e8e3da] py-6 text-xs text-[#82796c]",
        )}
      >
        <span>Context Layer · The context behind the code</span>
        <Link href="/">Back to home</Link>
      </footer>
    </div>
  );
}
