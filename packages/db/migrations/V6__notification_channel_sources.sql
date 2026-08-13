create table notification_channel_sources (
  id text primary key,
  "workspaceId" text not null,
  "channelId" text not null,
  provider text not null,
  "createdByMembershipId" text not null,
  "createdAt" timestamp with time zone not null default now(),
  constraint notification_channel_sources_channel_fk
    foreign key ("workspaceId", "channelId")
    references notification_channels ("workspaceId", id)
    on delete cascade,
  constraint notification_channel_sources_creator_fk
    foreign key ("workspaceId", "createdByMembershipId")
    references workspace_memberships ("workspaceId", id)
    on delete no action deferrable initially deferred,
  constraint notification_channel_sources_channel_provider_unique
    unique ("channelId", provider),
  constraint notification_channel_sources_provider_key_format check (
    char_length(provider) between 1 and 63
    and provider ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  )
);

create index notification_channel_sources_workspace_channel_idx
  on notification_channel_sources ("workspaceId", "channelId");
