create table integration_mcp_tools (
  id text primary key,
  "workspaceId" text not null,
  "integrationId" text not null,
  "toolName" text not null,
  "enabledByMembershipId" text not null,
  "createdAt" timestamp with time zone not null default now(),
  constraint integration_mcp_tools_integration_fk
    foreign key ("workspaceId", "integrationId")
    references integrations ("workspaceId", id)
    on delete cascade,
  constraint integration_mcp_tools_enabler_fk
    foreign key ("workspaceId", "enabledByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint integration_mcp_tools_integration_name_unique
    unique ("integrationId", "toolName"),
  constraint integration_mcp_tools_workspace_id_id_unique
    unique ("workspaceId", id),
  constraint integration_mcp_tools_name_format check (
    char_length("toolName") between 3 and 128
    and "toolName" ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)+$'
  )
);

create index integration_mcp_tools_workspace_integration_idx
  on integration_mcp_tools ("workspaceId", "integrationId");
