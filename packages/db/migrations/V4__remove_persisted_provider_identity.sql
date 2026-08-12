alter table integration_accounts
  drop constraint integration_accounts_connected_identity,
  drop column "externalAccountId",
  drop column "externalDisplayName";
