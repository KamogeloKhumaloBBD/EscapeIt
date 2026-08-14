import {
  InvalidIntegrationKeyError,
  parseProviderKey,
  type BundleProviderSummary,
  type CurrentWorkspace,
  type IntegrationBundle,
  type IntegrationBundleDetail,
  type ProviderKey,
} from "@context-layer/db";

import { HttpError } from "../../errors";
import type { ProviderRegistry } from "../../integrations/provider-registry";
import { requireWorkspace } from "../shared/require-workspace";
import type { IntegrationBundleContract } from "./bundle.contracts";

interface IntegrationBundleRepository {
  create(input: {
    createdByMembershipId: string;
    description: string | null;
    name: string;
    workspaceId: string;
  }): Promise<IntegrationBundle>;
  delete(
    workspaceId: string,
    bundleId: string,
    ownerMembershipId: string,
  ): Promise<void>;
  findCurrentWorkspace(userId: string): Promise<CurrentWorkspace | null>;
  get(
    workspaceId: string,
    bundleId: string,
    membershipId: string,
  ): Promise<IntegrationBundleDetail | null>;
  list(
    workspaceId: string,
    membershipId: string,
  ): Promise<IntegrationBundleDetail[]>;
  replaceProviders(
    workspaceId: string,
    bundleId: string,
    ownerMembershipId: string,
    providers: readonly ProviderKey[],
  ): Promise<BundleProviderSummary[]>;
  update(
    workspaceId: string,
    bundleId: string,
    ownerMembershipId: string,
    input: {
      description?: string | null | undefined;
      name?: string | undefined;
    },
  ): Promise<IntegrationBundle>;
}

function parseProviders(values: readonly string[]): ProviderKey[] {
  try {
    return values.map((value) => parseProviderKey(value));
  } catch (error) {
    if (error instanceof InvalidIntegrationKeyError) {
      throw new HttpError(
        400,
        "INVALID_REQUEST",
        "One or more provider keys are invalid.",
      );
    }

    throw error;
  }
}

export interface IntegrationBundleServiceDependencies {
  providerRegistry: ProviderRegistry;
  repository: IntegrationBundleRepository;
}

function requireOwner(workspace: CurrentWorkspace): void {
  if (workspace.membership.role !== "owner") {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Workspace owner access is required.",
    );
  }
}

function toContract(
  bundle: IntegrationBundleDetail,
  isOwner: boolean,
  providerRegistry: ProviderRegistry,
): IntegrationBundleContract {
  return {
    createdAt: bundle.createdAt.toISOString(),
    description: bundle.description,
    id: bundle.id,
    name: bundle.name,
    permissions: { canManage: isOwner },
    providers: bundle.providers.map((provider) => ({
      displayName:
        providerRegistry.get(provider.provider)?.displayName ??
        provider.provider,
      provider: provider.provider,
      status: provider.status,
    })),
    updatedAt: bundle.updatedAt.toISOString(),
  };
}

async function requireBundle(
  repository: IntegrationBundleRepository,
  workspaceId: string,
  bundleId: string,
  membershipId: string,
): Promise<IntegrationBundleDetail> {
  const bundle = await repository.get(workspaceId, bundleId, membershipId);

  if (bundle === null) {
    throw new HttpError(404, "BUNDLE_NOT_FOUND", "Bundle not found.");
  }

  return bundle;
}

export function createIntegrationBundleService({
  providerRegistry,
  repository,
}: IntegrationBundleServiceDependencies) {
  async function current(userId: string): Promise<CurrentWorkspace> {
    return requireWorkspace(await repository.findCurrentWorkspace(userId));
  }

  return {
    async create(
      userId: string,
      input: { description: string | null; name: string },
    ): Promise<IntegrationBundleContract> {
      const workspace = await current(userId);
      requireOwner(workspace);
      const bundle = await repository.create({
        createdByMembershipId: workspace.membership.id,
        description: input.description,
        name: input.name,
        workspaceId: workspace.workspace.id,
      });

      return toContract({ ...bundle, providers: [] }, true, providerRegistry);
    },

    async delete(userId: string, bundleId: string): Promise<void> {
      const workspace = await current(userId);
      requireOwner(workspace);
      await repository.delete(
        workspace.workspace.id,
        bundleId,
        workspace.membership.id,
      );
    },

    async getDetail(
      userId: string,
      bundleId: string,
    ): Promise<IntegrationBundleContract> {
      const workspace = await current(userId);
      const bundle = await requireBundle(
        repository,
        workspace.workspace.id,
        bundleId,
        workspace.membership.id,
      );

      return toContract(
        bundle,
        workspace.membership.role === "owner",
        providerRegistry,
      );
    },

    async list(userId: string): Promise<readonly IntegrationBundleContract[]> {
      const workspace = await current(userId);
      const bundles = await repository.list(
        workspace.workspace.id,
        workspace.membership.id,
      );
      const isOwner = workspace.membership.role === "owner";

      return bundles.map((bundle) =>
        toContract(bundle, isOwner, providerRegistry),
      );
    },

    async replaceProviders(
      userId: string,
      bundleId: string,
      providers: readonly string[],
    ): Promise<IntegrationBundleContract> {
      const workspace = await current(userId);
      requireOwner(workspace);
      await repository.replaceProviders(
        workspace.workspace.id,
        bundleId,
        workspace.membership.id,
        parseProviders(providers),
      );
      const bundle = await requireBundle(
        repository,
        workspace.workspace.id,
        bundleId,
        workspace.membership.id,
      );

      return toContract(bundle, true, providerRegistry);
    },

    async update(
      userId: string,
      bundleId: string,
      input: {
        description?: string | null | undefined;
        name?: string | undefined;
      },
    ): Promise<IntegrationBundleContract> {
      const workspace = await current(userId);
      requireOwner(workspace);
      await repository.update(
        workspace.workspace.id,
        bundleId,
        workspace.membership.id,
        input,
      );
      const bundle = await requireBundle(
        repository,
        workspace.workspace.id,
        bundleId,
        workspace.membership.id,
      );

      return toContract(bundle, true, providerRegistry);
    },
  };
}
