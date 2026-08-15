import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  DeleteBundleButton,
  UpdateBundleForm,
} from "@/app/(workspace)/bundles/bundle-actions";
import { ProviderSelector } from "@/app/(workspace)/bundles/[bundleId]/provider-selector";
import { CustomMcpSelector } from "@/app/(workspace)/bundles/[bundleId]/custom-mcp-selector";
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
import { WorkspacePage } from "@/components/workspace-page";
import { getIntegrationsState } from "@/lib/server/integration";
import { getBundleState } from "@/lib/server/integration-bundle";
import { getCustomMcpServersState } from "@/lib/server/custom-mcp";

export default async function BundleDetailPage({
  params,
}: {
  params: Promise<{ bundleId: string }>;
}) {
  const { bundleId } = await params;
  const [state, integrationsState, customMcpState] = await Promise.all([
    getBundleState(bundleId),
    getIntegrationsState(),
    getCustomMcpServersState(),
  ]);

  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "not-found") notFound();

  if (state.status !== "available") {
    return (
      <WorkspacePage width="focused">
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden="true" />
          <AlertTitle>Bundle unavailable</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </WorkspacePage>
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
  const availableCustomMcpServers =
    customMcpState.status === "available" ? customMcpState.data : [];

  return (
    <WorkspacePage width="focused">
      <WorkspacePageHeader
        action={
          <Button asChild>
            <Link href="/agent-setup">Use this bundle</Link>
          </Button>
        }
        description={
          bundle.permissions.canEdit
            ? "Owned by you. Manage this bundle's name, description, and providers."
            : `Owned by ${bundle.creator.name} (${bundle.creator.email}). Personal access tokens can be scoped to this bundle from Agent Setup.`
        }
        title={bundle.name}
      />

      {bundle.permissions.canEdit ? (
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

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Custom MCP servers</CardTitle>
              <CardDescription>
                Select separately from native providers. Members still use their
                own credentials for protected servers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableCustomMcpServers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Custom MCP servers are installed. Add one from{" "}
                  <Link className="underline" href="/integrations">
                    Integrations
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <CustomMcpSelector
                  bundleId={bundle.id}
                  selectedIds={bundle.customMcpServers.map(
                    (server) => server.id,
                  )}
                  servers={availableCustomMcpServers}
                />
              )}
            </CardContent>
          </Card>
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
                The bundle owner has not added any providers yet.
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

      {bundle.permissions.canDelete ? (
        <section className="mt-10 border border-destructive/25 bg-destructive/5 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-sm font-semibold">
              {bundle.permissions.canEdit
                ? "Delete bundle"
                : "Administrative deletion"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Tokens and MCP connections assigned to this bundle must be revoked
              or reassigned first.
            </p>
          </div>
          <div className="mt-4 shrink-0 sm:mt-0">
            <DeleteBundleButton
              bundleId={bundle.id}
              name={bundle.name}
              redirectTo="/bundles"
            />
          </div>
        </section>
      ) : null}
    </WorkspacePage>
  );
}
