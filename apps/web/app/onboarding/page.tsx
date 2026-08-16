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
            <OnboardingForm />
          </div>
        )}
      </section>
    </main>
  );
}
