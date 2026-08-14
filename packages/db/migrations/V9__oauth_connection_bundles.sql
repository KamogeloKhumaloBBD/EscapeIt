create table oauth_connection_bundles (
  id text primary key,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "userId" text not null references users(id) on delete cascade,
  "referenceId" text not null references workspaces(id) on delete cascade,
  "bundleId" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  constraint oauth_connection_bundles_unique
    unique ("clientId", "userId", "referenceId"),
  constraint oauth_connection_bundles_bundle_fk
    foreign key ("referenceId", "bundleId")
    references integration_bundles ("workspaceId", id)
    on delete no action deferrable initially deferred
);

create index oauth_connection_bundles_reference_idx
  on oauth_connection_bundles ("referenceId");
