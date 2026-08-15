create table digest_runs (
  id text primary key,
  "workspaceId" text not null,
  "periodStart" timestamp with time zone not null,
  "periodEnd" timestamp with time zone not null,
  trigger text not null,
  "sentCount" integer not null,
  "createdAt" timestamp with time zone not null default now(),
  constraint digest_runs_workspace_fk
    foreign key ("workspaceId")
    references workspaces (id)
    on delete cascade,
  -- The idempotency key. One digest per workspace per period, so a retried
  -- scheduled run or a second replica cannot email the workspace twice.
  constraint digest_runs_workspace_period_unique
    unique ("workspaceId", "periodStart"),
  constraint digest_runs_trigger_allowed check (
    trigger in ('scheduled', 'manual')
  ),
  constraint digest_runs_period_ordered check ("periodEnd" > "periodStart"),
  constraint digest_runs_sent_count_positive check ("sentCount" >= 0)
);

create index digest_runs_workspace_created_idx
  on digest_runs ("workspaceId", "createdAt" desc);
