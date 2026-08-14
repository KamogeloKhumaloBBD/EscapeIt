import type { DatabaseClient } from "./client";
import { withTransaction } from "./client";
import type {
  ConnectionStatus,
  IntegrationBundle,
  ProviderKey,
} from "./domain";
import { RepositoryError } from "./repository-errors";
import {
  createProductId,
  requireMembership,
  requireOwner,
  requireReturnedRow,
} from "./repository-helpers";

export interface CreateIntegrationBundleInput {
  createdByMembershipId: string;
  description: string | null;
  name: string;
  workspaceId: string;
}

export interface UpdateIntegrationBundleInput {
  description?: string | null | undefined;
  name?: string | undefined;
}

export interface BundleProviderSummary {
  integrationId: string;
  provider: ProviderKey;
  status: ConnectionStatus;
}

export interface IntegrationBundleDetail extends IntegrationBundle {
  providers: BundleProviderSummary[];
}

function validateName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length < 1 || trimmed.length > 120) {
    throw new RepositoryError(
      "invalid",
      "Bundle names must contain between 1 and 120 characters.",
    );
  }

  return trimmed;
}

function validateDescription(description: string | null): string | null {
  if (description === null) {
    return null;
  }

  const trimmed = description.trim();

  if (trimmed.length < 1 || trimmed.length > 500) {
    throw new RepositoryError(
      "invalid",
      "Bundle descriptions must contain between 1 and 500 characters.",
    );
  }

  return trimmed;
}

async function attachProviders(
  database: DatabaseClient,
  workspaceId: string,
  bundles: readonly IntegrationBundle[],
): Promise<IntegrationBundleDetail[]> {
  if (bundles.length === 0) {
    return [];
  }

  const bundleIds = bundles.map((bundle) => bundle.id);
  const rows = await database<(BundleProviderSummary & { bundleId: string })[]>`
    select
      bundleProvider."bundleId",
      bundleProvider."integrationId",
      integration.provider,
      integration.status
    from integration_bundle_providers bundleProvider
    join integrations integration
      on integration.id = bundleProvider."integrationId"
      and integration."workspaceId" = bundleProvider."workspaceId"
    where
      bundleProvider."workspaceId" = ${workspaceId}
      and bundleProvider."bundleId" in ${database(bundleIds)}
    order by integration.provider
  `;
  const providersByBundle = new Map<string, BundleProviderSummary[]>();

  for (const row of rows) {
    const providers = providersByBundle.get(row.bundleId) ?? [];
    providers.push({
      integrationId: row.integrationId,
      provider: row.provider,
      status: row.status,
    });
    providersByBundle.set(row.bundleId, providers);
  }

  return bundles.map((bundle) => ({
    ...bundle,
    providers: providersByBundle.get(bundle.id) ?? [],
  }));
}

export async function createIntegrationBundle(
  database: DatabaseClient,
  input: CreateIntegrationBundleInput,
): Promise<IntegrationBundle> {
  const name = validateName(input.name);
  const description = validateDescription(input.description);

  return withTransaction(database, async (transaction) => {
    await requireOwner(
      transaction,
      input.workspaceId,
      input.createdByMembershipId,
    );

    const rows = await transaction<IntegrationBundle[]>`
      insert into integration_bundles (
        id,
        "workspaceId",
        name,
        description,
        "createdByMembershipId"
      ) values (
        ${createProductId()},
        ${input.workspaceId},
        ${name},
        ${description},
        ${input.createdByMembershipId}
      )
      returning *
    `;

    return requireReturnedRow(rows[0]);
  });
}

export async function updateIntegrationBundle(
  database: DatabaseClient,
  workspaceId: string,
  bundleId: string,
  ownerMembershipId: string,
  input: UpdateIntegrationBundleInput,
): Promise<IntegrationBundle> {
  const name = input.name === undefined ? null : validateName(input.name);
  const description =
    input.description === undefined
      ? null
      : validateDescription(input.description);

  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const rows = await transaction<IntegrationBundle[]>`
      update integration_bundles
      set
        name = coalesce(${name}, name),
        description = case
          when ${input.description === undefined} then description
          else ${description}
        end,
        "updatedAt" = now()
      where id = ${bundleId} and "workspaceId" = ${workspaceId}
      returning *
    `;
    const bundle = rows[0];

    if (bundle === undefined) {
      throw new RepositoryError("not_found", "Bundle not found.");
    }

    return bundle;
  });
}

export async function deleteIntegrationBundle(
  database: DatabaseClient,
  workspaceId: string,
  bundleId: string,
  ownerMembershipId: string,
): Promise<void> {
  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const bundles = await transaction<{ id: string }[]>`
      select id
      from integration_bundles
      where id = ${bundleId} and "workspaceId" = ${workspaceId}
      for update
    `;

    if (bundles[0] === undefined) {
      throw new RepositoryError("not_found", "Bundle not found.");
    }

    const activeTokens = await transaction<{ id: string }[]>`
      select id
      from mcp_tokens
      where "bundleId" = ${bundleId} and "revokedAt" is null
      for update
    `;

    if (activeTokens.length > 0) {
      throw new RepositoryError(
        "conflict",
        "Revoke or reassign tokens scoped to this bundle first.",
      );
    }

    const activeConnections = await transaction<{ id: string }[]>`
      select connectionBundle.id
      from oauth_connection_bundles connectionBundle
      where connectionBundle."bundleId" = ${bundleId}
        and exists (
          select 1
          from "oauthConsent" consent
          where consent."clientId" = connectionBundle."clientId"
            and consent."userId" = connectionBundle."userId"
            and consent."referenceId" is not distinct from connectionBundle."referenceId"
        )
      for update
    `;

    if (activeConnections.length > 0) {
      throw new RepositoryError(
        "conflict",
        "Reassign the MCP connections scoped to this bundle first.",
      );
    }

    await transaction`
      update mcp_tokens
      set "bundleId" = null
      where "bundleId" = ${bundleId} and "revokedAt" is not null
    `;

    await transaction`
      delete from integration_bundles
      where id = ${bundleId} and "workspaceId" = ${workspaceId}
    `;
  });
}

export async function listIntegrationBundles(
  database: DatabaseClient,
  workspaceId: string,
  membershipId: string,
): Promise<IntegrationBundleDetail[]> {
  await requireMembership(database, workspaceId, membershipId);
  const bundles = await database<IntegrationBundle[]>`
    select *
    from integration_bundles
    where "workspaceId" = ${workspaceId}
    order by name, id
  `;

  return attachProviders(database, workspaceId, bundles);
}

export async function findIntegrationBundle(
  database: DatabaseClient,
  workspaceId: string,
  bundleId: string,
  membershipId: string,
): Promise<IntegrationBundleDetail | null> {
  await requireMembership(database, workspaceId, membershipId);
  const bundles = await database<IntegrationBundle[]>`
    select *
    from integration_bundles
    where id = ${bundleId} and "workspaceId" = ${workspaceId}
  `;
  const bundle = bundles[0];

  if (bundle === undefined) {
    return null;
  }

  const [detail] = await attachProviders(database, workspaceId, [bundle]);
  return detail ?? null;
}

export async function findIntegrationBundleSummary(
  database: DatabaseClient,
  workspaceId: string,
  bundleId: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await database<{ id: string; name: string }[]>`
    select id, name
    from integration_bundles
    where id = ${bundleId} and "workspaceId" = ${workspaceId}
  `;

  return rows[0] ?? null;
}

export async function findIntegrationBundleProviderKeys(
  database: DatabaseClient,
  workspaceId: string,
  bundleId: string,
): Promise<ProviderKey[]> {
  const rows = await database<{ provider: ProviderKey }[]>`
    select integration.provider
    from integration_bundle_providers bundleProvider
    join integrations integration
      on integration.id = bundleProvider."integrationId"
      and integration."workspaceId" = bundleProvider."workspaceId"
    where
      bundleProvider."workspaceId" = ${workspaceId}
      and bundleProvider."bundleId" = ${bundleId}
  `;

  return rows.map((row) => row.provider);
}

export async function replaceIntegrationBundleProviders(
  database: DatabaseClient,
  workspaceId: string,
  bundleId: string,
  ownerMembershipId: string,
  providers: readonly ProviderKey[],
): Promise<BundleProviderSummary[]> {
  if (new Set(providers).size !== providers.length) {
    throw new RepositoryError("invalid", "Duplicate provider selection.");
  }

  return withTransaction(database, async (transaction) => {
    await requireOwner(transaction, workspaceId, ownerMembershipId);
    const bundles = await transaction<{ id: string }[]>`
      select id
      from integration_bundles
      where id = ${bundleId} and "workspaceId" = ${workspaceId}
      for update
    `;

    if (bundles[0] === undefined) {
      throw new RepositoryError("not_found", "Bundle not found.");
    }

    let integrationIds: string[] = [];

    if (providers.length > 0) {
      const integrations = await transaction<
        { id: string; provider: ProviderKey }[]
      >`
        select id, provider
        from integrations
        where "workspaceId" = ${workspaceId} and provider in ${transaction(providers)}
      `;
      const found = new Set(
        integrations.map((integration) => integration.provider),
      );

      if (providers.some((provider) => !found.has(provider))) {
        throw new RepositoryError(
          "invalid",
          "One or more providers are unavailable in this workspace.",
        );
      }

      integrationIds = integrations.map((integration) => integration.id);
    }

    await transaction`
      delete from integration_bundle_providers
      where "workspaceId" = ${workspaceId} and "bundleId" = ${bundleId}
    `;

    for (const integrationId of integrationIds) {
      await transaction`
        insert into integration_bundle_providers (
          id,
          "workspaceId",
          "bundleId",
          "integrationId",
          "addedByMembershipId"
        ) values (
          ${createProductId()},
          ${workspaceId},
          ${bundleId},
          ${integrationId},
          ${ownerMembershipId}
        )
      `;
    }

    if (integrationIds.length === 0) {
      return [];
    }

    const rows = await transaction<
      (BundleProviderSummary & { bundleId: string })[]
    >`
      select
        bundleProvider."bundleId",
        bundleProvider."integrationId",
        integration.provider,
        integration.status
      from integration_bundle_providers bundleProvider
      join integrations integration
        on integration.id = bundleProvider."integrationId"
        and integration."workspaceId" = bundleProvider."workspaceId"
      where
        bundleProvider."workspaceId" = ${workspaceId}
        and bundleProvider."bundleId" = ${bundleId}
      order by integration.provider
    `;

    return rows.map((row) => ({
      integrationId: row.integrationId,
      provider: row.provider,
      status: row.status,
    }));
  });
}
