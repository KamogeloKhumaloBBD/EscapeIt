import {
  ArrowRightIcon,
  ChartLineIcon,
  KeyIcon,
  PlugsConnectedIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  parseWelcomeSource,
  welcomeHeading,
  welcomeSteps,
  type WelcomeStepIcon,
} from "@/app/(workspace)/welcome/presentation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkspacePage } from "@/components/workspace-page";
import { getCurrentWorkspaceState } from "@/lib/server/workspace";

const stepIcons = {
  agent: KeyIcon,
  integrations: PlugsConnectedIcon,
  members: UsersThreeIcon,
  overview: ChartLineIcon,
} satisfies Record<WelcomeStepIcon, typeof KeyIcon>;

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [state, parameters] = await Promise.all([
    getCurrentWorkspaceState(),
    searchParams,
  ]);

  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "without-workspace") redirect("/onboarding");

  if (state.status !== "available") {
    return (
      <WorkspacePage width="focused">
        <Alert variant="destructive">
          <AlertTitle>Welcome unavailable</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </WorkspacePage>
    );
  }

  const source = parseWelcomeSource(parameters.source);
  const heading = welcomeHeading(source, state.workspace.name);
  const steps = welcomeSteps(state.workspace.role);

  return (
    <WorkspacePage className="lg:pt-16" width="focused">
      <header className="max-w-3xl">
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          {heading.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em] text-balance sm:text-5xl">
          {heading.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          {heading.description}
        </p>
      </header>

      <ol
        aria-label="Workspace setup steps"
        className="mt-10 grid gap-4 md:grid-cols-3"
      >
        {steps.map((step, index) => {
          const Icon = stepIcons[step.icon];
          const first = index === 0;

          return (
            <li className="flex" key={step.href}>
              <Card
                className={
                  first
                    ? "h-full w-full border-primary/35 bg-primary/[0.025] shadow-none"
                    : "h-full w-full shadow-none"
                }
              >
                <CardHeader>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="grid size-10 place-items-center bg-primary/8 text-primary">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">
                      Step {index + 1}
                    </span>
                  </div>
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-2">
                  <Button
                    asChild
                    className="w-full"
                    variant={first ? "default" : "outline"}
                  >
                    <Link href={step.href}>
                      {step.action}
                      <ArrowRightIcon
                        aria-hidden="true"
                        data-icon="inline-end"
                      />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 flex justify-center">
        <Button asChild variant="ghost">
          <Link href="/dashboard">Skip to overview</Link>
        </Button>
      </div>
    </WorkspacePage>
  );
}
