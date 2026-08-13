create table "oauthClient" (
  id text primary key,
  "clientId" text not null unique,
  "clientSecret" text,
  disabled boolean not null default false,
  "skipConsent" boolean,
  "enableEndSession" boolean,
  "subjectType" text,
  scopes text[],
  "userId" text references users(id) on delete cascade,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  "expiresAt" timestamp with time zone,
  name text,
  uri text,
  icon text,
  contacts text[],
  tos text,
  policy text,
  "softwareId" text,
  "softwareVersion" text,
  "softwareStatement" text,
  "redirectUris" text[] not null,
  "postLogoutRedirectUris" text[],
  "tokenEndpointAuthMethod" text,
  "grantTypes" text[],
  "responseTypes" text[],
  public boolean,
  type text,
  "requirePKCE" boolean,
  "referenceId" text,
  metadata jsonb
);

create index "oauthClient_userId_idx" on "oauthClient" ("userId");

create table "oauthConsent" (
  id text primary key,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "userId" text references users(id) on delete cascade,
  "referenceId" text,
  scopes text[] not null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create index "oauthConsent_clientId_idx" on "oauthConsent" ("clientId");
create index "oauthConsent_userId_idx" on "oauthConsent" ("userId");
create unique index "oauthConsent_member_client_workspace_unique"
  on "oauthConsent" ("clientId", "userId", "referenceId");

create table "oauthRefreshToken" (
  id text primary key,
  token text not null unique,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "sessionId" text references sessions(id) on delete set null,
  "userId" text not null references users(id) on delete cascade,
  "referenceId" text,
  "expiresAt" timestamp with time zone not null,
  "createdAt" timestamp with time zone not null default now(),
  revoked timestamp with time zone,
  "authTime" timestamp with time zone,
  scopes text[] not null
);

create index "oauthRefreshToken_clientId_idx" on "oauthRefreshToken" ("clientId");
create index "oauthRefreshToken_sessionId_idx" on "oauthRefreshToken" ("sessionId");
create index "oauthRefreshToken_userId_idx" on "oauthRefreshToken" ("userId");
create index "oauthRefreshToken_member_workspace_idx"
  on "oauthRefreshToken" ("userId", "referenceId");

create table "oauthAccessToken" (
  id text primary key,
  token text not null unique,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "sessionId" text references sessions(id) on delete set null,
  "userId" text references users(id) on delete cascade,
  "referenceId" text,
  "refreshId" text references "oauthRefreshToken" (id) on delete cascade,
  "expiresAt" timestamp with time zone not null,
  "createdAt" timestamp with time zone not null default now(),
  scopes text[] not null
);

create index "oauthAccessToken_clientId_idx" on "oauthAccessToken" ("clientId");
create index "oauthAccessToken_sessionId_idx" on "oauthAccessToken" ("sessionId");
create index "oauthAccessToken_userId_idx" on "oauthAccessToken" ("userId");
create index "oauthAccessToken_refreshId_idx" on "oauthAccessToken" ("refreshId");
create index "oauthAccessToken_member_workspace_idx"
  on "oauthAccessToken" ("userId", "referenceId");
