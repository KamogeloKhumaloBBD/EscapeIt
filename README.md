# Context Layer

Context Layer is a pnpm monorepo containing an independently deployable Next.js frontend, Express API, and PostgreSQL infrastructure. Better Auth owns authentication, raw SQL repositories own product persistence, and Flyway is the only migration path.

## Requirements

- Node.js 24.18.0 LTS
- pnpm 11.21.0
- Docker Desktop or another Compose-compatible runtime
- A Resend API key and verified sender for passwordless sign-in

## Start locally

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev:full
```

On PowerShell, use `Copy-Item .env.example .env`. Replace every placeholder in `.env` before starting.

- Web: <http://localhost:3000>
- API health: <http://localhost:4000/api/health>
- Proxied health: <http://localhost:3000/api/health>
- Onboarding: <http://localhost:3000/onboarding>
- Dashboard: <http://localhost:3000/dashboard>

The browser uses relative `/api/*` paths. Next.js proxies them to the Express API, which owns authentication and every application endpoint.

## Workspace

```text
apps/web       Next.js frontend
apps/api       Express API
packages/db    PostgreSQL utilities and Flyway SQL migrations
```

## Data foundation

Better Auth users may be signed in without a workspace. The onboarding flow creates a workspace and its owner membership atomically; invitation acceptance will be added in a later slice. Each user can belong to only one workspace.

The Express workspace API exposes authenticated `GET /api/workspaces/current`, `POST /api/workspaces`, and `GET /api/workspaces/current/overview` endpoints. Next.js calls these endpoints from Server Components and Server Actions; it never accesses PostgreSQL directly.

The product schema includes workspaces, memberships, invitations, workspace provider installations, member-specific provider accounts, selected provider scopes, MCP token hashes, notification channels, per-member notification preference overrides, and correlated activity events.

- Providers are registered in API code using stable keys and capability metadata. Jira, Bitbucket, Confluence, and Teams are intended initial adapters, not database-level special cases.
- Provider installation configuration is workspace-wide; member account credentials remain member-specific.
- Notification-channel and provider credentials are stored only as authenticated AES-256-GCM envelopes.
- Integration-account and channel IDs are allocated before encryption because each envelope is cryptographically bound to its record ID and purpose.
- Provider scopes are deny-by-default: an empty allowlist grants no resource access.
- Provider scope and event keys are namespaced, such as `jira.project` and `jira.issue.updated`, so new adapters do not require schema changes.
- Notification preferences store only member overrides. When no override exists, the API uses the event's `defaultEnabled` value from the provider registry.
- Invitation and MCP secrets are never stored, only their 32-byte SHA-256 hashes.
- Product IDs are application-generated UUIDv7 strings.

## Commands

| Command                   | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `pnpm dev:full`           | Start PostgreSQL, Express, and Next.js        |
| `pnpm dev:web`            | Start Next.js                                 |
| `pnpm dev:api`            | Start Express                                 |
| `pnpm db:up`              | Start local PostgreSQL and wait for health    |
| `pnpm db:down`            | Stop PostgreSQL and preserve its named volume |
| `pnpm db:migrate`         | Run reviewed Flyway migrations locally        |
| `pnpm db:railway:migrate` | Run Flyway against linked Railway Postgres    |
| `pnpm db:validate`        | Validate local Flyway migrations              |
| `pnpm db:info`            | Inspect local Flyway state                    |
| `pnpm verify`             | Check formatting, linting, types, and builds  |
| `pnpm docker:build`       | Build both production application images      |

Migrations never run during web or API startup. Product data is never seeded.

## Environment

Frontend server:

- `PUBLIC_APP_URL`: public Next.js origin
- `API_INTERNAL_URL`: server-side Express origin
- `PORT`: hosting-platform port; defaults to `3000` in the image

API:

- `DATABASE_URL`, `DATABASE_SSL_MODE`
- `PORT` in hosted environments, or `API_PORT` locally
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `AUTH_EMAIL_FROM`, `RESEND_API_KEY`
- `CREDENTIAL_ENCRYPTION_KEY`
- `PUBLIC_APP_URL`

Local Compose additionally uses `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_PORT`. See `.env.example` for valid formats.

## Railway

Railway runs `web`, `api`, and `Postgres` in one project. The application service manifests are `railway.web.json` and `railway.api.json`.

Use these service configuration paths in Railway and keep the repository root as each build context. Configure:

```text
web
  API_INTERNAL_URL=http://api.railway.internal:4000
  PUBLIC_APP_URL=https://<web-domain>
  PORT=3000

api
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  DATABASE_SSL_MODE=disable
  BETTER_AUTH_URL=https://<web-domain>
  PUBLIC_APP_URL=https://<web-domain>
  PORT=4000

```

Run migrations explicitly before an application release containing new SQL:

```sh
railway run --service Postgres pnpm db:railway:migrate
```

The Postgres service must have an active TCP proxy and a `DATABASE_PUBLIC_URL` composed from that proxy plus Railway's `PGUSER`, `POSTGRES_PASSWORD`, and `PGDATABASE` references. The command passes that URL to the pinned Flyway Docker image without making migration part of application startup. Deploy API next, then web. Apply `V2__context_layer_foundation.sql` before deploying any API code that calls the product repositories.

Railway health checks require the configured `PORT`. If web cannot reach Express, verify `API_INTERNAL_URL`, the lowercase `api` service name, and private networking. If auth cookies fail, confirm `BETTER_AUTH_URL` and `PUBLIC_APP_URL` exactly match the HTTPS web origin.

## Database safety

Local PostgreSQL stores data in the `context_layer_postgres_data` named volume. Changing `POSTGRES_PORT` also requires updating the port in local `DATABASE_URL`.

Production migrations are reviewed SQL files under `packages/db/migrations`, executed separately with Flyway credentials. V1 creates Better Auth's core tables; V2 adds the Context Layer tenancy and integration foundation. This repository does not run either migration during application startup.
