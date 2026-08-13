alter table "oauthClient"
  alter column scopes type text using to_jsonb(scopes)::text,
  alter column contacts type text using to_jsonb(contacts)::text,
  alter column "redirectUris" type text using to_jsonb("redirectUris")::text,
  alter column "postLogoutRedirectUris" type text using to_jsonb("postLogoutRedirectUris")::text,
  alter column "grantTypes" type text using to_jsonb("grantTypes")::text,
  alter column "responseTypes" type text using to_jsonb("responseTypes")::text;

alter table "oauthConsent"
  alter column scopes type text using to_jsonb(scopes)::text;

alter table "oauthRefreshToken"
  alter column scopes type text using to_jsonb(scopes)::text;

alter table "oauthAccessToken"
  alter column scopes type text using to_jsonb(scopes)::text;
