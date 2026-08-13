alter table integrations
  add column "webhookToken" text,
  add column "webhookRegistrationId" text;

alter table integrations
  add constraint integrations_webhook_token_unique unique ("webhookToken");

alter table integrations
  add constraint integrations_webhook_token_length check (
    "webhookToken" is null or char_length("webhookToken") between 32 and 128
  );

create index integrations_webhook_token_idx
  on integrations ("webhookToken")
  where "webhookToken" is not null;
