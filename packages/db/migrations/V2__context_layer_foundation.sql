create type workspace_role as enum ('owner', 'member');
create type connection_status as enum ('disconnected', 'connected', 'error');
create type activity_category as enum (
  'workspace',
  'integration',
  'mcp',
  'context',
  'webhook',
  'notification'
);
create type activity_status as enum (
  'started',
  'succeeded',
  'partially_succeeded',
  'failed'
);

create table workspaces (
  id text primary key,
  name text not null,
  "createdByUserId" text references users(id) on delete set null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint workspaces_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint workspaces_timestamps_ordered check ("updatedAt" >= "createdAt")
);

create table workspace_memberships (
  id text primary key,
  "workspaceId" text not null references workspaces(id) on delete cascade,
  "userId" text not null references users(id) on delete restrict,
  role workspace_role not null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint workspace_memberships_one_workspace_per_user unique ("userId"),
  constraint workspace_memberships_workspace_id_id_unique unique ("workspaceId", id),
  constraint workspace_memberships_timestamps_ordered check ("updatedAt" >= "createdAt")
);

create unique index workspace_memberships_one_owner_per_workspace
  on workspace_memberships ("workspaceId")
  where role = 'owner';

create index workspace_memberships_workspace_id_idx
  on workspace_memberships ("workspaceId");

create table workspace_invitations (
  id text primary key,
  "workspaceId" text not null references workspaces(id) on delete cascade,
  "normalizedEmail" text not null,
  "tokenHash" bytea not null unique,
  "invitedByMembershipId" text not null,
  "acceptedByMembershipId" text,
  "expiresAt" timestamp with time zone not null,
  "acceptedAt" timestamp with time zone,
  "revokedAt" timestamp with time zone,
  "createdAt" timestamp with time zone not null default now(),
  constraint workspace_invitations_inviter_fk
    foreign key ("workspaceId", "invitedByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint workspace_invitations_acceptor_fk
    foreign key ("workspaceId", "acceptedByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint workspace_invitations_email_normalized check (
    "normalizedEmail" = lower(btrim("normalizedEmail"))
    and char_length("normalizedEmail") between 3 and 320
  ),
  constraint workspace_invitations_token_hash_length check (octet_length("tokenHash") = 32),
  constraint workspace_invitations_expiry_after_creation check ("expiresAt" > "createdAt"),
  constraint workspace_invitations_acceptance_consistent check (
    ("acceptedAt" is null and "acceptedByMembershipId" is null)
    or ("acceptedAt" is not null and "acceptedByMembershipId" is not null)
  ),
  constraint workspace_invitations_terminal_state check (
    not ("acceptedAt" is not null and "revokedAt" is not null)
  )
);

create unique index workspace_invitations_one_pending_per_workspace_email
  on workspace_invitations ("workspaceId", "normalizedEmail")
  where "acceptedAt" is null and "revokedAt" is null;

create index workspace_invitations_pending_email_idx
  on workspace_invitations ("normalizedEmail", "expiresAt")
  where "acceptedAt" is null and "revokedAt" is null;

create table integrations (
  id text primary key,
  "workspaceId" text not null references workspaces(id) on delete cascade,
  provider text not null,
  status connection_status not null default 'disconnected',
  configuration jsonb not null default '{}'::jsonb,
  "configuredByMembershipId" text,
  "lastValidatedAt" timestamp with time zone,
  "lastErrorCode" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint integrations_workspace_provider_unique unique ("workspaceId", provider),
  constraint integrations_workspace_id_id_unique unique ("workspaceId", id),
  constraint integrations_configurer_fk
    foreign key ("workspaceId", "configuredByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint integrations_provider_key_format check (
    char_length(provider) between 1 and 63
    and provider ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  ),
  constraint integrations_configuration_object check (jsonb_typeof(configuration) = 'object'),
  constraint integrations_error_code_length check (
    "lastErrorCode" is null or char_length("lastErrorCode") between 1 and 100
  ),
  constraint integrations_timestamps_ordered check ("updatedAt" >= "createdAt")
);

create index integrations_workspace_status_idx
  on integrations ("workspaceId", status);

create table integration_accounts (
  id text primary key,
  "workspaceId" text not null,
  "integrationId" text not null,
  "membershipId" text not null,
  status connection_status not null default 'disconnected',
  "externalAccountId" text,
  "externalDisplayName" text,
  "credentialEnvelope" text,
  "lastValidatedAt" timestamp with time zone,
  "lastErrorCode" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint integration_accounts_integration_fk
    foreign key ("workspaceId", "integrationId")
    references integrations ("workspaceId", id)
    on delete cascade,
  constraint integration_accounts_membership_fk
    foreign key ("workspaceId", "membershipId")
    references workspace_memberships ("workspaceId", id)
    on delete cascade,
  constraint integration_accounts_workspace_member_unique
    unique ("integrationId", "membershipId"),
  constraint integration_accounts_workspace_id_id_unique unique ("workspaceId", id),
  constraint integration_accounts_credentials_consistent check (
    (status = 'disconnected' and "credentialEnvelope" is null)
    or (status in ('connected', 'error') and "credentialEnvelope" is not null)
  ),
  constraint integration_accounts_connected_identity check (
    status <> 'connected' or "externalAccountId" is not null
  ),
  constraint integration_accounts_error_code_length check (
    "lastErrorCode" is null or char_length("lastErrorCode") between 1 and 100
  ),
  constraint integration_accounts_timestamps_ordered check ("updatedAt" >= "createdAt")
);

create index integration_accounts_membership_status_idx
  on integration_accounts ("membershipId", status);

create table integration_scopes (
  id text primary key,
  "workspaceId" text not null,
  "integrationId" text not null,
  "scopeKey" text not null,
  "externalId" text not null,
  "displayName" text not null,
  "createdByMembershipId" text not null,
  "createdAt" timestamp with time zone not null default now(),
  constraint integration_scopes_integration_fk
    foreign key ("workspaceId", "integrationId")
    references integrations ("workspaceId", id)
    on delete cascade,
  constraint integration_scopes_creator_fk
    foreign key ("workspaceId", "createdByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint integration_scopes_provider_identity_unique
    unique ("integrationId", "scopeKey", "externalId"),
  constraint integration_scopes_scope_key_format check (
    char_length("scopeKey") between 3 and 191
    and "scopeKey" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)+$'
  ),
  constraint integration_scopes_external_id_length check (char_length("externalId") between 1 and 500),
  constraint integration_scopes_display_name_length check (char_length(btrim("displayName")) between 1 and 500)
);

create index integration_scopes_workspace_integration_idx
  on integration_scopes ("workspaceId", "integrationId");

create table mcp_tokens (
  id text primary key,
  "workspaceId" text not null references workspaces(id) on delete cascade,
  "createdByMembershipId" text not null,
  name text not null,
  prefix text not null,
  "tokenHash" bytea not null unique,
  "expiresAt" timestamp with time zone,
  "lastUsedAt" timestamp with time zone,
  "revokedAt" timestamp with time zone,
  "revokedByMembershipId" text,
  "createdAt" timestamp with time zone not null default now(),
  constraint mcp_tokens_creator_fk
    foreign key ("workspaceId", "createdByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint mcp_tokens_revoker_fk
    foreign key ("workspaceId", "revokedByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint mcp_tokens_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint mcp_tokens_prefix_length check (char_length(prefix) between 4 and 24),
  constraint mcp_tokens_token_hash_length check (octet_length("tokenHash") = 32),
  constraint mcp_tokens_expiry_after_creation check (
    "expiresAt" is null or "expiresAt" > "createdAt"
  ),
  constraint mcp_tokens_last_used_after_creation check (
    "lastUsedAt" is null or "lastUsedAt" >= "createdAt"
  ),
  constraint mcp_tokens_revocation_consistent check (
    ("revokedAt" is null and "revokedByMembershipId" is null)
    or ("revokedAt" is not null and "revokedByMembershipId" is not null)
  )
);

create index mcp_tokens_workspace_created_idx
  on mcp_tokens ("workspaceId", "createdAt" desc, id desc);

create table notification_channels (
  id text primary key,
  "workspaceId" text not null references workspaces(id) on delete cascade,
  provider text not null,
  status connection_status not null default 'disconnected',
  name text not null,
  configuration jsonb not null default '{}'::jsonb,
  "credentialEnvelope" text,
  "createdByMembershipId" text not null,
  "lastValidatedAt" timestamp with time zone,
  "lastErrorCode" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint notification_channels_workspace_id_id_unique unique ("workspaceId", id),
  constraint notification_channels_creator_fk
    foreign key ("workspaceId", "createdByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint notification_channels_provider_key_format check (
    char_length(provider) between 1 and 63
    and provider ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  ),
  constraint notification_channels_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint notification_channels_configuration_object check (jsonb_typeof(configuration) = 'object'),
  constraint notification_channels_credentials_consistent check (
    (status = 'disconnected' and "credentialEnvelope" is null)
    or (status in ('connected', 'error') and "credentialEnvelope" is not null)
  ),
  constraint notification_channels_error_code_length check (
    "lastErrorCode" is null or char_length("lastErrorCode") between 1 and 100
  ),
  constraint notification_channels_timestamps_ordered check ("updatedAt" >= "createdAt")
);

create index notification_channels_workspace_status_idx
  on notification_channels ("workspaceId", status);

create table notification_preferences (
  id text primary key,
  "workspaceId" text not null,
  "membershipId" text not null,
  "eventKey" text not null,
  enabled boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint notification_preferences_membership_fk
    foreign key ("workspaceId", "membershipId")
    references workspace_memberships ("workspaceId", id)
    on delete cascade,
  constraint notification_preferences_membership_event_unique
    unique ("membershipId", "eventKey"),
  constraint notification_preferences_event_key_format check (
    char_length("eventKey") between 3 and 191
    and "eventKey" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)+$'
  ),
  constraint notification_preferences_timestamps_ordered check ("updatedAt" >= "createdAt")
);

create index notification_preferences_workspace_member_idx
  on notification_preferences ("workspaceId", "membershipId");

create table activity_events (
  id text primary key,
  "workspaceId" text not null references workspaces(id) on delete cascade,
  "actorMembershipId" text,
  "subjectMembershipId" text,
  "parentEventId" text,
  "correlationId" text not null,
  category activity_category not null,
  status activity_status not null,
  provider text,
  operation text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  "externalEventId" text,
  "occurredAt" timestamp with time zone not null default now(),
  "createdAt" timestamp with time zone not null default now(),
  constraint activity_events_workspace_id_id_unique unique ("workspaceId", id),
  constraint activity_events_actor_fk
    foreign key ("workspaceId", "actorMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint activity_events_subject_fk
    foreign key ("workspaceId", "subjectMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint activity_events_parent_fk
    foreign key ("workspaceId", "parentEventId")
    references activity_events ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint activity_events_correlation_id_length check (char_length("correlationId") between 1 and 128),
  constraint activity_events_operation_length check (char_length(operation) between 1 and 120),
  constraint activity_events_summary_length check (char_length(summary) between 1 and 1000),
  constraint activity_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint activity_events_external_provider_consistent check (
    "externalEventId" is null or provider is not null
  ),
  constraint activity_events_provider_key_format check (
    provider is null
    or (
      char_length(provider) between 1 and 63
      and provider ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
    )
  )
);

create unique index activity_events_external_deduplication_idx
  on activity_events ("workspaceId", provider, "externalEventId")
  where "externalEventId" is not null;

create index activity_events_correlation_idx
  on activity_events ("workspaceId", "correlationId", "occurredAt", id);

create index activity_events_cursor_idx
  on activity_events ("workspaceId", "occurredAt" desc, id desc);
