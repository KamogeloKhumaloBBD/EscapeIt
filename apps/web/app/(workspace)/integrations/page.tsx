import {
  ArrowRightIcon,
  PlugsConnectedIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import { getIntegrationsState } from "@/lib/server/integration";

function actionLabel(nextStep: string): string {
  if (nextStep === "connect_provider") return "Connect";
  if (nextStep === "ready") return "Manage";
  if (nextStep === "wait_for_owner") return "View";
  return "Continue setup";
}

export default async function IntegrationsPage() {
  const state = await getIntegrationsState();

  if (state.status === "anonymous") redirect("/sign-in");

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-10 lg:px-10 lg:pt-14">
      <Badge variant="secondary">Workspace</Badge>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
        Integrations
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
        Connect the tools where your team plans, builds, and shares knowledge.
      </p>

      {state.status !== "available" ? (
        <Alert className="mt-10" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Integrations unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load the provider catalogue. Refresh to try again.
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="mt-10">
          <CardHeader>
            <CardTitle id="available-heading">Available providers</CardTitle>
            <CardDescription>
              Providers enabled for this Context Layer deployment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.data.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PlugsConnectedIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No providers configured</EmptyTitle>
                  <EmptyDescription>
                    Configure a provider on the API deployment to make it
                    available here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup
                className="gap-0"
                role="list"
                aria-labelledby="available-heading"
              >
                {state.data.map((integration, index) => (
                  <div key={integration.provider}>
                    {index > 0 ? <ItemSeparator /> : null}
                    <Item>
                      <ItemMedia
                        className="size-10 bg-primary/10 text-primary"
                        variant="icon"
                      >
                        <span
                          aria-hidden="true"
                          className="font-heading text-sm font-semibold"
                        >
                          {integration.displayName.slice(0, 1)}
                        </span>
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>
                          {integration.displayName}
                          <Badge
                            variant={
                              integration.attention === null
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {integration.nextStep === "ready"
                              ? "Ready"
                              : integration.installation === null
                                ? "Not connected"
                                : "Setup required"}
                          </Badge>
                        </ItemTitle>
                        <ItemDescription>
                          {integration.description}
                        </ItemDescription>
                        <div className="mt-1 flex flex-wrap gap-3">
                          {integration.capabilities.map((capability) => (
                            <Badge key={capability} variant="ghost">
                              {capability.replaceAll("-", " ")}
                            </Badge>
                          ))}
                        </div>
                      </ItemContent>
                      <ItemActions>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/integrations/${integration.provider}`}>
                            {actionLabel(integration.nextStep)}
                            <ArrowRightIcon
                              aria-hidden="true"
                              data-icon="inline-end"
                            />
                          </Link>
                        </Button>
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
