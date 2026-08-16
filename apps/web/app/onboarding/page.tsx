import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { getCurrentWorkspaceState } from "@/lib/server/workspace";

export default async function OnboardingPage() {
  const state = await getCurrentWorkspaceState();

  if (state.status === "anonymous") {
    redirect("/sign-in");
  }

  if (state.status === "available") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7] text-[#15130f]">
      <AppHeader showSignOut={state.status !== "unavailable"} />
      <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-md flex-col justify-center px-6 pb-24">
        {state.status === "unavailable" ? (
          <div>
            <p className="text-sm text-[#68635a]">Workspace setup</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">
              We can&apos;t load setup right now.
            </h1>
            <p className="mt-4 leading-7 text-[#68635a]">{state.message}</p>
            <Button asChild className="mt-8">
              <Link href="/onboarding">Try again</Link>
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-[#68635a]">Welcome to Context Layer</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">
              Create your workspace.
            </h1>
            <p className="mt-4 leading-7 text-[#68635a]">
              Start with a shared home for your team&apos;s context. You&apos;ll
              connect sources and your coding agent next.
            </p>
            <ol
              aria-label="Getting started steps"
              className="mt-7 grid grid-cols-3 gap-3 border-y border-[#e1dcd2] py-4"
            >
              {["Workspace", "Sources", "Agent"].map((label, index) => (
                <li className="min-w-0" key={label}>
                  <span className="block font-mono text-[0.625rem] text-[#8a8378]">
                    0{index + 1}
                  </span>
                  <span className="mt-1 block truncate text-xs font-medium">
                    {label}
                  </span>
                </li>
              ))}
            </ol>
            <OnboardingForm />
          </div>
        )}
      </section>
    </main>
  );
}
