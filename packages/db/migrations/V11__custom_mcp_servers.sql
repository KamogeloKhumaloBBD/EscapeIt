create table custom_mcp_servers (
  id text primary key,
  "workspaceId" text not null references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  "endpointUrl" text not null,
  "authenticationKind" text not null,
  status connection_status not null default 'disconnected',
  "configuredByMembershipId" text not null,
  "lastValidatedAt" timestamp with time zone,
  "lastErrorCode" text,
  "archivedAt" timestamp with time zone,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint custom_mcp_servers_workspace_id_id_unique unique ("workspaceId", id),
  constraint custom_mcp_servers_configurer_fk
    foreign key ("workspaceId", "configuredByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint custom_mcp_servers_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint custom_mcp_servers_slug_format check (
    char_length(slug) between 1 and 48 and slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  ),
  constraint custom_mcp_servers_endpoint_length check (char_length("endpointUrl") between 8 and 2048),
  constraint custom_mcp_servers_authentication_kind check (
    "authenticationKind" in ('none', 'oauth', 'bearer')
  ),
  constraint custom_mcp_servers_error_code_length check (
    "lastErrorCode" is null or char_length("lastErrorCode") between 1 and 100
  ),
  constraint custom_mcp_servers_timestamps_ordered check ("updatedAt" >= "createdAt")
);

create unique index custom_mcp_servers_active_slug_unique
  on custom_mcp_servers ("workspaceId", slug)
  where "archivedAt" is null;

create unique index custom_mcp_servers_active_endpoint_unique
  on custom_mcp_servers ("workspaceId", "endpointUrl")
  where "archivedAt" is null;

create index custom_mcp_servers_workspace_status_idx
  on custom_mcp_servers ("workspaceId", status)
  where "archivedAt" is null;

create table custom_mcp_accounts (
  id text primary key,
  "workspaceId" text not null,
  "serverId" text not null,
  "membershipId" text not null,
  "authMethod" text not null,
  status connection_status not null default 'disconnected',
  "credentialEnvelope" text,
  "lastValidatedAt" timestamp with time zone,
  "lastErrorCode" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint custom_mcp_accounts_workspace_id_id_unique unique ("workspaceId", id),
  constraint custom_mcp_accounts_server_fk
    foreign key ("workspaceId", "serverId")
    references custom_mcp_servers ("workspaceId", id)
    on delete cascade,
  constraint custom_mcp_accounts_membership_fk
    foreign key ("workspaceId", "membershipId")
    references workspace_memberships ("workspaceId", id)
    on delete cascade,
  constraint custom_mcp_accounts_server_member_unique unique ("serverId", "membershipId"),
  constraint custom_mcp_accounts_auth_method check ("authMethod" in ('oauth', 'bearer')),
  constraint custom_mcp_accounts_credentials_consistent check (
    (status = 'disconnected' and "credentialEnvelope" is null)
    or (status in ('connected', 'error') and "credentialEnvelope" is not null)
  ),
  constraint custom_mcp_accounts_error_code_length check (
    "lastErrorCode" is null or char_length("lastErrorCode") between 1 and 100
  ),
  constraint custom_mcp_accounts_timestamps_ordered check ("updatedAt" >= "createdAt")
);

create index custom_mcp_accounts_membership_status_idx
  on custom_mcp_accounts ("membershipId", status);

create table custom_mcp_tools (
  id text primary key,
  "workspaceId" text not null,
  "serverId" text not null,
  "upstreamName" text not null,
  "exposedName" text not null,
  title text,
  description text not null,
  "inputSchema" jsonb not null,
  "outputSchema" jsonb,
  annotations jsonb not null default '{}'::jsonb,
  "catalogHash" bytea not null,
  available boolean not null default true,
  enabled boolean not null default false,
  "enabledByMembershipId" text,
  "enabledAt" timestamp with time zone,
  "discoveredAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint custom_mcp_tools_workspace_id_id_unique unique ("workspaceId", id),
  constraint custom_mcp_tools_server_fk
    foreign key ("workspaceId", "serverId")
    references custom_mcp_servers ("workspaceId", id)
    on delete cascade,
  constraint custom_mcp_tools_enabler_fk
    foreign key ("workspaceId", "enabledByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint custom_mcp_tools_server_upstream_unique unique ("serverId", "upstreamName"),
  constraint custom_mcp_tools_upstream_name_length check (char_length("upstreamName") between 1 and 128),
  constraint custom_mcp_tools_exposed_name_format check (
    char_length("exposedName") between 3 and 128
    and "exposedName" ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)+$'
  ),
  constraint custom_mcp_tools_title_length check (
    title is null or char_length(btrim(title)) between 1 and 120
  ),
  constraint custom_mcp_tools_description_length check (char_length(description) between 1 and 1000),
  constraint custom_mcp_tools_input_schema_object check (jsonb_typeof("inputSchema") = 'object'),
  constraint custom_mcp_tools_output_schema_object check (
    "outputSchema" is null or jsonb_typeof("outputSchema") = 'object'
  ),
  constraint custom_mcp_tools_annotations_object check (jsonb_typeof(annotations) = 'object'),
  constraint custom_mcp_tools_catalog_hash_length check (octet_length("catalogHash") = 32),
  constraint custom_mcp_tools_enabled_consistent check (
    (enabled and available and "enabledByMembershipId" is not null and "enabledAt" is not null)
    or (not enabled and "enabledByMembershipId" is null and "enabledAt" is null)
  ),
  constraint custom_mcp_tools_timestamps_ordered check ("updatedAt" >= "discoveredAt")
);

create index custom_mcp_tools_workspace_server_idx
  on custom_mcp_tools ("workspaceId", "serverId");

create table integration_bundle_custom_mcp_servers (
  id text primary key,
  "workspaceId" text not null,
  "bundleId" text not null,
  "serverId" text not null,
  "addedByMembershipId" text not null,
  "createdAt" timestamp with time zone not null default now(),
  constraint integration_bundle_custom_mcp_servers_workspace_id_id_unique unique ("workspaceId", id),
  constraint integration_bundle_custom_mcp_servers_bundle_fk
    foreign key ("workspaceId", "bundleId")
    references integration_bundles ("workspaceId", id)
    on delete cascade,
  constraint integration_bundle_custom_mcp_servers_server_fk
    foreign key ("workspaceId", "serverId")
    references custom_mcp_servers ("workspaceId", id)
    on delete cascade,
  constraint integration_bundle_custom_mcp_servers_adder_fk
    foreign key ("workspaceId", "addedByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint integration_bundle_custom_mcp_servers_unique unique ("bundleId", "serverId")
);

create index integration_bundle_custom_mcp_servers_bundle_idx
  on integration_bundle_custom_mcp_servers ("workspaceId", "bundleId");

create table custom_mcp_oauth_attempts (
  id text primary key,
  "workspaceId" text not null,
  "serverId" text not null,
  "accountId" text not null,
  "membershipId" text not null,
  "stateHash" bytea not null unique,
  "credentialEnvelope" text not null,
  "expiresAt" timestamp with time zone not null,
  "createdAt" timestamp with time zone not null default now(),
  constraint custom_mcp_oauth_attempts_server_fk
    foreign key ("workspaceId", "serverId")
    references custom_mcp_servers ("workspaceId", id)
    on delete cascade,
  constraint custom_mcp_oauth_attempts_account_fk
    foreign key ("workspaceId", "accountId")
    references custom_mcp_accounts ("workspaceId", id)
    on delete cascade,
  constraint custom_mcp_oauth_attempts_membership_fk
    foreign key ("workspaceId", "membershipId")
    references workspace_memberships ("workspaceId", id)
    on delete cascade,
  constraint custom_mcp_oauth_attempts_state_hash_length check (octet_length("stateHash") = 32),
  constraint custom_mcp_oauth_attempts_expiry_after_creation check ("expiresAt" > "createdAt")
);

create index custom_mcp_oauth_attempts_expiry_idx on custom_mcp_oauth_attempts ("expiresAt");
