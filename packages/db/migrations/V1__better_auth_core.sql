create table users (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table sessions (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  token text not null unique,
  "expiresAt" timestamp with time zone not null,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table accounts (
  id text primary key,
  "userId" text not null references users(id) on delete cascade,
  "accountId" text not null,
  "providerId" text not null,
  "accessToken" text,
  "refreshToken" text,
  "accessTokenExpiresAt" timestamp with time zone,
  "refreshTokenExpiresAt" timestamp with time zone,
  scope text,
  "idToken" text,
  password text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamp with time zone not null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);
