import {
  ArrowRightIcon,
  PackageIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CreateBundleDialog,
  DeleteBundleButton,
} from "@/app/(workspace)/bundles/bundle-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { WorkspacePage } from "@/components/workspace-page";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { WorkspaceStatus } from "@/components/workspace-status";
import { getBundleListState } from "@/lib/server/integration-bundle";
import { getCurrentWorkspaceState } from "@/lib/server/workspace";

export default async function BundlesPage() {
  const [state, workspaceState] = await Promise.all([
    getBundleListState(),
    getCurrentWorkspaceState(),
  ]);

  if (state.status === "anonymous") redirect("/sign-in");
  if (workspaceState.status === "without-workspace") redirect("/onboarding");

  const isOwner =
    workspaceState.status === "available" &&
    workspaceState.workspace.role === "owner";

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        action={
          isOwner && state.status === "available" && state.data.length > 0 ? (
            <CreateBundleDialog />
          ) : undefined
        }
        description="Group connected providers so a personal access token can be scoped to just the tools an agent needs."
        title="Bundles"
      />

      {state.status !== "available" ? (
        <Alert className="mt-10" variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Bundles unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load your workspace bundles. Refresh to try again.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <section
            aria-label="Workspace bundles"
            className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {state.data.length === 0 ? (
              <Empty className="sm:col-span-2 xl:col-span-3">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No bundles yet</EmptyTitle>
                  <EmptyDescription>
                    {isOwner
                      ? "Create a bundle to scope a personal access token to a subset of connected providers."
                      : "The workspace owner has not created any bundles yet."}
                  </EmptyDescription>
                </EmptyHeader>
                {isOwner ? (
                  <EmptyContent>
                    <CreateBundleDialog triggerLabel="Create your first bundle" />
                  </EmptyContent>
                ) : null}
              </Empty>
            ) : (
              state.data.map((bundle) => (
                <Card
                  className="flex h-full flex-col shadow-none"
                  key={bundle.id}
                >
                  <CardHeader>
                    <CardTitle>{bundle.name}</CardTitle>
                    <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {bundle.description ?? "No description."}
                    </p>
                    <CardAction>
                      <WorkspaceStatus
                        tone={
                          bundle.providers.length > 0 &&
                          bundle.providers.every(
                            (provider) => provider.status === "connected",
                          )
                            ? "ready"
                            : "setup"
                        }
                      >
                        {bundle.providers.length === 0
                          ? "No providers"
                          : bundle.providers.every(
                                (provider) => provider.status === "connected",
                              )
                            ? "Ready"
                            : "Needs review"}
                      </WorkspaceStatus>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <div className="flex flex-1 flex-wrap gap-1.5">
                      {bundle.providers.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No providers selected
                        </span>
                      ) : (
                        bundle.providers.map((provider) => (
                          <Badge
                            key={provider.provider}
                            variant={
                              provider.status === "connected"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {provider.displayName}
                          </Badge>
                        ))
                      )}
                    </div>
                    <div className="mt-6 flex items-center justify-between gap-4">
                      <Button asChild variant="outline">
                        <Link href={`/bundles/${bundle.id}`}>
                          {bundle.permissions.canManage ? "Manage" : "View"}
                          <ArrowRightIcon
                            aria-hidden="true"
                            data-icon="inline-end"
                          />
                        </Link>
                      </Button>
                      {bundle.permissions.canManage ? (
                        <DeleteBundleButton
                          bundleId={bundle.id}
                          menu
                          name={bundle.name}
                        />
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        </>
      )}
    </WorkspacePage>
  );
}
