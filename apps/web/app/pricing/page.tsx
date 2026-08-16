import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  AuthControl,
  AuthControlSkeleton,
} from "@/components/auth/auth-control";
import { BrandIcon } from "@/components/brand-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  description:
    "Proposed pricing for individuals, engineering teams, and enterprises using Context Layer.",
  title: "Pricing | Context Layer",
};

interface PricingPlan {
  action: string;
  description: string;
  features: readonly string[];
  href?: string;
  name: string;
  price: string;
  priceDetail: string;
  recommended?: boolean;
}

const plans: readonly PricingPlan[] = [
  {
    action: "Start free",
    description: "For developers proving the workflow with their own tools.",
    features: [
      "1 workspace member",
      "2 connected providers",
      "1,000 MCP tool calls per month",
      "7-day activity history",
      "Personal tokens and agent connections",
    ],
    href: "/sign-in",
    name: "Individual",
    price: "R0",
    priceDetail: "forever",
  },
  {
    action: "Planned",
    description: "For teams turning shared context into daily infrastructure.",
    features: [
      "Unlimited workspace members",
      "All available provider integrations",
      "10,000 MCP tool calls per member, per month",
      "90-day activity history",
      "Integration bundles, notifications, and daily digests",
      "Owner controls and email support",
    ],
    name: "Team",
    price: "R299",
    priceDetail: "per member / month",
    recommended: true,
  },
  {
    action: "Contact sales",
    description:
      "For organisations with tailored governance and support needs.",
    features: [
      "Everything in Team",
      "Custom tool-call limits and data retention",
      "SAML SSO and automated provisioning",
      "Audit exports and governance review",
      "Guided rollout and priority support",
      "Service-level agreement",
    ],
    name: "Enterprise",
    price: "Custom",
    priceDetail: "designed around your organisation",
  },
] as const;

const modelPrinciples = [
  {
    detail:
      "Provider identities and MCP credentials belong to people, so paid value grows with the members receiving secure context.",
    label: "Seats match the value",
    number: "01",
  },
  {
    detail:
      "Clear monthly call allowances make spend understandable while keeping normal provider access broad and useful.",
    label: "Usage stays predictable",
    number: "02",
  },
  {
    detail:
      "Advanced governance, retention, and rollout support vary by organisation and are scoped together at Enterprise level.",
    label: "Complexity is priced honestly",
    number: "03",
  },
] as const;

export default function PricingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfaf7] text-[#15130f]">
      <div className="hero-surface">
        <header className="relative z-20 mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6 lg:px-8">
          <Link
            className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
            href="/"
          >
            <BrandIcon className="size-6" />
            Context Layer
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-4">
            <Link
              className="text-sm text-[#68635a] underline-offset-4 hover:text-[#15130f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
              href="/"
            >
              Home
            </Link>
            <Suspense fallback={<AuthControlSkeleton />}>
              <AuthControl />
            </Suspense>
          </div>
        </header>

        <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 pt-14 sm:pt-20 lg:px-8 lg:pb-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="border-primary/20 bg-white/70" variant="default">
              Proposed pricing
            </Badge>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.065em] sm:text-6xl">
              Pricing that scales with the team, not the tool stack.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-[#68635a] sm:text-xl">
              Start with your own workflow, then bring the whole engineering
              team into one permission-aware context layer.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-[minmax(0,1fr)] items-stretch gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                className={cn(
                  "relative h-full min-w-0 bg-white/90 shadow-[0_18px_55px_rgba(30,25,50,0.07)] backdrop-blur-sm",
                  plan.recommended &&
                    "border-primary/55 shadow-[0_24px_70px_rgba(73,48,221,0.14)]",
                )}
                key={plan.name}
              >
                <CardHeader className="border-b border-[#e2ded5] pb-6">
                  <div className="flex min-h-6 items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#68635a]">
                      {plan.name}
                    </p>
                    {plan.recommended ? <Badge>Recommended</Badge> : null}
                  </div>
                  <CardTitle className="mt-5 text-4xl tracking-[-0.055em] sm:text-5xl">
                    {plan.price}
                  </CardTitle>
                  <p className="min-h-5 text-xs font-medium uppercase tracking-[0.12em] text-[#817b73]">
                    {plan.priceDetail}
                  </p>
                  <CardDescription className="mt-4 min-h-12 text-[#68635a]">
                    {plan.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex-1">
                  <ul className="space-y-3.5" role="list">
                    {plan.features.map((feature) => (
                      <li
                        className="flex items-start gap-3 leading-6 text-[#514c44]"
                        key={feature}
                      >
                        <CheckCircleIcon
                          aria-hidden="true"
                          className="mt-1 size-4 shrink-0 text-[#5a41e8]"
                          weight="fill"
                        />
                        <span className="min-w-0">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="mt-auto">
                  {plan.href === undefined ? (
                    <Button
                      aria-disabled="true"
                      className="w-full"
                      disabled
                      size="lg"
                      variant={plan.recommended ? "default" : "outline"}
                    >
                      {plan.action}
                    </Button>
                  ) : (
                    <Button asChild className="w-full" size="lg">
                      <Link href={plan.href}>{plan.action}</Link>
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      </div>

      <section className="border-y border-[#dedbd2] bg-white/55">
        <div className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5a41e8]">
              Why this model
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
              Built around how context is actually consumed.
            </h2>
          </div>

          <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {modelPrinciples.map((principle) => (
              <article
                className="border-t border-[#dedbd2] pt-6"
                key={principle.number}
              >
                <span className="font-mono text-xs text-[#5a41e8]">
                  {principle.number}
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-[-0.025em]">
                  {principle.label}
                </h3>
                <p className="mt-3 leading-7 text-[#68635a]">
                  {principle.detail}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-16 text-sm leading-6 text-[#68635a] md:grid-cols-3 lg:px-8 lg:py-20">
        <div>
          <h2 className="font-semibold text-[#15130f]">What is a tool call?</h2>
          <p className="mt-2">
            One request from an MCP client to a Context Layer provider tool,
            whether it reads context or performs an enabled action.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-[#15130f]">
            Are provider subscriptions included?
          </h2>
          <p className="mt-2">
            No. Jira, Confluence, GitHub, Bitbucket, Teams, and other upstream
            subscriptions remain with the customer.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-[#15130f]">Is billing live?</h2>
          <p className="mt-2">
            Not yet. This page describes the proposed commercial model; no plan
            is currently charged or enforced.
          </p>
        </div>
      </section>

      <footer className="border-t border-[#dedbd2]">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-[#68635a] lg:px-8">
          <span>Context Layer</span>
          <Link
            className="underline-offset-4 hover:text-[#15130f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
            href="/privacy"
          >
            Privacy
          </Link>
        </div>
      </footer>
    </main>
  );
}
