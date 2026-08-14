import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  DeleteBundleButton,
  UpdateBundleForm,
} from "@/app/(workspace)/bundles/bundle-actions";
import { ProviderSelector } from "@/app/(workspace)/bundles/[bundleId]/provider-selector";
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
import { ItemGroup, Item, ItemContent, ItemTitle } from "@/components/ui/item";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { getIntegrationsState } from "@/lib/server/integration";
import { getBundleState } from "@/lib/server/integration-bundle";

export default async function BundleDetailPage({
  params,
}: {
  params: Promise<{ bundleId: string }>;
}) {
  const { bundleId } = await params;
  const [state, integrationsState] = await Promise.all([
    getBundleState(bundleId),
    getIntegrationsState(),
  ]);

  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "not-found") notFound();

  if (state.status !== "available") {
    return (
      <main className="mx-auto w-full max-w-4xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12">
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Bundle unavailable</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load this bundle. Refresh to try again.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const { data: bundle } = state;
  const availableProviders =
    integrationsState.status === "available"
      ? integrationsState.data
          .filter((integration) => integration.installation !== null)
          .map((integration) => ({
            displayName: integration.displayName,
            installed: true,
            provider: integration.provider,
          }))
      : [];

  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12">
      <WorkspacePageHeader
        action={
          <Button asChild variant="outline">
            <Link href="/bundles">Back to bundles</Link>
          </Button>
        }
        description={
          bundle.permissions.canManage
            ? "Manage this bundle's name, description, and providers."
            : "Personal access tokens can be scoped to this bundle from Agent Setup."
        }
        eyebrow="Bundles"
        title={bundle.name}
      />

      {bundle.permissions.canManage ? (
        <>
          <Card className="mt-10">
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>
                Visible to every workspace member.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UpdateBundleForm
                bundleId={bundle.id}
                description={bundle.description}
                name={bundle.name}
              />
            </CardContent>
          </Card>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Providers</CardTitle>
              <CardDescription>
                Only integrations already installed for this workspace can join
                a bundle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableProviders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No providers are installed for this workspace yet. Connect one
                  from{" "}
                  <Link className="underline" href="/integrations">
                    Integrations
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <ProviderSelector
                  availableProviders={availableProviders}
                  bundleId={bundle.id}
                  selectedProviders={bundle.providers.map(
                    (provider) => provider.provider,
                  )}
                />
              )}
            </CardContent>
          </Card>

          <div className="mt-8 flex justify-end">
            <DeleteBundleButton
              bundleId={bundle.id}
              name={bundle.name}
              redirectTo="/bundles"
            />
          </div>
        </>
      ) : (
        <Card className="mt-10">
          <CardHeader>
            <CardTitle>Providers</CardTitle>
            <CardDescription>
              {bundle.description ?? "No description."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bundle.providers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                The workspace owner has not added any providers to this bundle
                yet.
              </p>
            ) : (
              <ItemGroup>
                {bundle.providers.map((provider) => (
                  <Item key={provider.provider}>
                    <ItemContent>
                      <ItemTitle>{provider.displayName}</ItemTitle>
                    </ItemContent>
                    <Badge
                      variant={
                        provider.status === "connected"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {provider.status}
                    </Badge>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-8">
        <Button asChild variant="ghost">
          <Link href="/agent-setup">Create a token scoped to this bundle</Link>
        </Button>
      </div>
    </main>
  );
}
