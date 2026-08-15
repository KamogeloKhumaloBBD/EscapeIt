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

export interface BundleCustomMcpServerSummary {
  id: string;
  name: string;
  status: ConnectionStatus;
}

export interface IntegrationBundleCreatorSummary {
  email: string;
  membershipId: string;
  name: string;
}

export interface IntegrationBundleDetail extends IntegrationBundle {
  creator: IntegrationBundleCreatorSummary;
  customMcpServers: BundleCustomMcpServerSummary[];
  providers: BundleProviderSummary[];
}

interface IntegrationBundleWithCreator extends IntegrationBundle {
  creatorEmail: string;
  creatorName: string;
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
  bundles: readonly IntegrationBundleWithCreator[],
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
  const customRows = await database<
    (BundleCustomMcpServerSummary & { bundleId: string })[]
  >`
    select
      bundleServer."bundleId",
      server.id,
      server.name,
      server.status
    from integration_bundle_custom_mcp_servers bundleServer
    join custom_mcp_servers server
      on server.id = bundleServer."serverId"
      and server."workspaceId" = bundleServer."workspaceId"
    where
      bundleServer."workspaceId" = ${workspaceId}
      and bundleServer."bundleId" in ${database(bundleIds)}
      and server."archivedAt" is null
    order by server.name, server.id
  `;
  const customByBundle = new Map<string, BundleCustomMcpServerSummary[]>();

  for (const row of rows) {
    const providers = providersByBundle.get(row.bundleId) ?? [];
    providers.push({
      integrationId: row.integrationId,
      provider: row.provider,
      status: row.status,
    });
    providersByBundle.set(row.bundleId, providers);
  }

  for (const row of customRows) {
    const servers = customByBundle.get(row.bundleId) ?? [];
    servers.push({ id: row.id, name: row.name, status: row.status });
    customByBundle.set(row.bundleId, servers);
  }

  return bundles.map(({ creatorEmail, creatorName, ...bundle }) => ({
    ...bundle,
    creator: {
      email: creatorEmail,
      membershipId: bundle.createdByMembershipId,
      name: creatorName,
    },
    customMcpServers: customByBundle.get(bundle.id) ?? [],
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
    await requireMembership(
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
  actingMembershipId: string,
  input: UpdateIntegrationBundleInput,
): Promise<IntegrationBundle> {
  const name = input.name === undefined ? null : validateName(input.name);
  const description =
    input.description === undefined
      ? null
      : validateDescription(input.description);

  return withTransaction(database, async (transaction) => {
    await requireMembership(transaction, workspaceId, actingMembershipId);
    const existingBundles = await transaction<
      { createdByMembershipId: string }[]
    >`
      select "createdByMembershipId"
      from integration_bundles
      where id = ${bundleId} and "workspaceId" = ${workspaceId}
      for update
    `;
    const existingBundle = existingBundles[0];

    if (existingBundle === undefined) {
      throw new RepositoryError("not_found", "Bundle not found.");
    }

    if (existingBundle.createdByMembershipId !== actingMembershipId) {
      throw new RepositoryError(
        "forbidden",
        "Only the bundle owner can edit this bundle.",
      );
    }

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
  actingMembershipId: string,
): Promise<void> {
  return withTransaction(database, async (transaction) => {
    const membership = await requireMembership(
      transaction,
      workspaceId,
      actingMembershipId,
    );
    const bundles = await transaction<
      { createdByMembershipId: string; id: string }[]
    >`
      select id, "createdByMembershipId"
      from integration_bundles
      where id = ${bundleId} and "workspaceId" = ${workspaceId}
      for update
    `;

    if (bundles[0] === undefined) {
      throw new RepositoryError("not_found", "Bundle not found.");
    }

    if (
      bundles[0].createdByMembershipId !== actingMembershipId &&
      membership.role !== "owner"
    ) {
      throw new RepositoryError(
        "forbidden",
        "Only the bundle owner or workspace owner can delete this bundle.",
      );
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
  const bundles = await database<IntegrationBundleWithCreator[]>`
    select
      bundle.*,
      creator.name as "creatorName",
      creator.email as "creatorEmail"
    from integration_bundles bundle
    join workspace_memberships creatorMembership
      on creatorMembership.id = bundle."createdByMembershipId"
      and creatorMembership."workspaceId" = bundle."workspaceId"
    join users creator on creator.id = creatorMembership."userId"
    where bundle."workspaceId" = ${workspaceId}
    order by bundle.name, bundle.id
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
  const bundles = await database<IntegrationBundleWithCreator[]>`
    select
      bundle.*,
      creator.name as "creatorName",
      creator.email as "creatorEmail"
    from integration_bundles bundle
    join workspace_memberships creatorMembership
      on creatorMembership.id = bundle."createdByMembershipId"
      and creatorMembership."workspaceId" = bundle."workspaceId"
    join users creator on creator.id = creatorMembership."userId"
    where bundle.id = ${bundleId} and bundle."workspaceId" = ${workspaceId}
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

export async function findIntegrationBundleCustomMcpServerIds(
  database: DatabaseClient,
  workspaceId: string,
  bundleId: string,
): Promise<string[]> {
  const rows = await database<{ serverId: string }[]>`
    select bundleServer."serverId"
    from integration_bundle_custom_mcp_servers bundleServer
    join custom_mcp_servers server
      on server.id = bundleServer."serverId"
      and server."workspaceId" = bundleServer."workspaceId"
    where
      bundleServer."workspaceId" = ${workspaceId}
      and bundleServer."bundleId" = ${bundleId}
      and server."archivedAt" is null
  `;
  return rows.map((row) => row.serverId);
}

export async function replaceIntegrationBundleCustomMcpServers(
  database: DatabaseClient,
  workspaceId: string,
  bundleId: string,
  actingMembershipId: string,
  serverIds: readonly string[],
): Promise<BundleCustomMcpServerSummary[]> {
  if (new Set(serverIds).size !== serverIds.length) {
    throw new RepositoryError(
      "invalid",
      "Duplicate Custom MCP server selection.",
    );
  }
  return withTransaction(database, async (transaction) => {
    await requireMembership(transaction, workspaceId, actingMembershipId);
    const bundles = await transaction<{ createdByMembershipId: string }[]>`
      select "createdByMembershipId"
      from integration_bundles
      where id = ${bundleId} and "workspaceId" = ${workspaceId}
      for update
    `;
    const bundle = bundles[0];
    if (bundle === undefined) {
      throw new RepositoryError("not_found", "Bundle not found.");
    }
    if (bundle.createdByMembershipId !== actingMembershipId) {
      throw new RepositoryError(
        "forbidden",
        "Only the bundle owner can edit this bundle.",
      );
    }
    let servers: BundleCustomMcpServerSummary[] = [];
    if (serverIds.length > 0) {
      servers = await transaction<BundleCustomMcpServerSummary[]>`
        select id, name, status
        from custom_mcp_servers
        where
          "workspaceId" = ${workspaceId}
          and "archivedAt" is null
          and id in ${transaction([...serverIds])}
      `;
      if (servers.length !== serverIds.length) {
        throw new RepositoryError(
          "invalid",
          "One or more Custom MCP servers are unavailable in this workspace.",
        );
      }
    }
    await transaction`
      delete from integration_bundle_custom_mcp_servers
      where "workspaceId" = ${workspaceId} and "bundleId" = ${bundleId}
    `;
    for (const serverId of serverIds) {
      await transaction`
        insert into integration_bundle_custom_mcp_servers (
          id, "workspaceId", "bundleId", "serverId", "addedByMembershipId"
        ) values (
          ${createProductId()}, ${workspaceId}, ${bundleId}, ${serverId},
          ${actingMembershipId}
        )
      `;
    }
    return servers.sort((left, right) => left.name.localeCompare(right.name));
  });
}

export async function replaceIntegrationBundleProviders(
  database: DatabaseClient,
  workspaceId: string,
  bundleId: string,
  actingMembershipId: string,
  providers: readonly ProviderKey[],
): Promise<BundleProviderSummary[]> {
  if (new Set(providers).size !== providers.length) {
    throw new RepositoryError("invalid", "Duplicate provider selection.");
  }

  return withTransaction(database, async (transaction) => {
    await requireMembership(transaction, workspaceId, actingMembershipId);
    const bundles = await transaction<
      { createdByMembershipId: string; id: string }[]
    >`
      select id, "createdByMembershipId"
      from integration_bundles
      where id = ${bundleId} and "workspaceId" = ${workspaceId}
      for update
    `;

    if (bundles[0] === undefined) {
      throw new RepositoryError("not_found", "Bundle not found.");
    }

    if (bundles[0].createdByMembershipId !== actingMembershipId) {
      throw new RepositoryError(
        "forbidden",
        "Only the bundle owner can edit this bundle.",
      );
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
          ${actingMembershipId}
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
