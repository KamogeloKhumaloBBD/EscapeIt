alter table integration_scopes
  add column "externalKey" text;

alter table integration_scopes
  add constraint integration_scopes_external_key_length check (
    "externalKey" is null or char_length("externalKey") between 1 and 500
  );
