create table integration_bundles (
  id text primary key,
  "workspaceId" text not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  "createdByMembershipId" text not null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint integration_bundles_workspace_id_id_unique
    unique ("workspaceId", id),
  constraint integration_bundles_creator_fk
    foreign key ("workspaceId", "createdByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint integration_bundles_name_length check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint integration_bundles_description_length check (
    description is null or char_length(description) between 1 and 500
  ),
  constraint integration_bundles_timestamps_ordered check ("updatedAt" >= "createdAt")
);

create index integration_bundles_workspace_idx on integration_bundles ("workspaceId");

create table integration_bundle_providers (
  id text primary key,
  "workspaceId" text not null,
  "bundleId" text not null,
  "integrationId" text not null,
  "addedByMembershipId" text not null,
  "createdAt" timestamp with time zone not null default now(),
  constraint integration_bundle_providers_bundle_fk
    foreign key ("workspaceId", "bundleId")
    references integration_bundles ("workspaceId", id)
    on delete cascade,
  constraint integration_bundle_providers_integration_fk
    foreign key ("workspaceId", "integrationId")
    references integrations ("workspaceId", id)
    on delete cascade,
  constraint integration_bundle_providers_adder_fk
    foreign key ("workspaceId", "addedByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint integration_bundle_providers_unique
    unique ("bundleId", "integrationId"),
  constraint integration_bundle_providers_workspace_id_id_unique
    unique ("workspaceId", id)
);

create index integration_bundle_providers_workspace_bundle_idx
  on integration_bundle_providers ("workspaceId", "bundleId");

alter table mcp_tokens add column "bundleId" text;

alter table mcp_tokens
  add constraint mcp_tokens_bundle_fk
    foreign key ("workspaceId", "bundleId")
    references integration_bundles ("workspaceId", id)
    on delete no action deferrable initially deferred;
