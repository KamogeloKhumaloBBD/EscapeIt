# Context Layer

Context Layer is a pnpm monorepo containing an independently deployable Next.js frontend, Express API, and PostgreSQL infrastructure. Better Auth owns authentication, raw SQL repositories own product persistence, and Flyway is the only migration path.

## Requirements

- Node.js 24.18.0 LTS
- pnpm 11.21.0
- Docker Desktop or another Compose-compatible runtime
- A Resend API key and verified sender for passwordless sign-in
- An Atlassian OAuth 2.0 app when developing the Jira integration

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
- Integrations: <http://localhost:3000/integrations>
- Members: <http://localhost:3000/members>
- Agent Setup: <http://localhost:3000/agent-setup>

The browser uses relative `/api/*` paths. Next.js proxies them to the Express API, which owns authentication and every application endpoint.

## Workspace

```text
apps/web       Next.js frontend
apps/api       Express API
packages/email Shared React Email templates
packages/db    PostgreSQL utilities and Flyway SQL migrations
```

## Data foundation

Better Auth users may be signed in without a workspace. The onboarding flow creates a workspace and its owner membership atomically. Workspace owners can invite members by email from `/members`; recipients sign in passwordlessly and accept through the emailed link. Each user can belong to only one workspace.

The Express workspace API exposes authenticated workspace, member, and invitation endpoints. Next.js calls these endpoints from Server Components and Server Actions; it never accesses PostgreSQL directly. Invitation links expire after seven days, only their SHA-256 hashes are stored, and the signed-in email must match before acceptance.

The authenticated application uses a shared workspace shell. The dashboard derives setup progress, connection health, counts, and recent activity from real API data rather than frontend placeholders.

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

## MCP gateway

Each member creates personal Context Layer access tokens from `/agent-setup`. A token has the form `ctx_mcp_<secret>`, does not expire, and is shown only once. PostgreSQL stores its SHA-256 hash and a safe prefix, never the raw token. Members manage their own tokens; workspace owners can audit safe metadata and revoke any workspace token, but cannot recover or use it.

The stateless Streamable HTTP endpoint is:

```text
POST <PUBLIC_APP_URL>/api/mcp
Authorization: Bearer <token>
```

MCP requests always run as the membership that created the token. Better Auth cookies, query-string tokens, and client-supplied workspace identities are not accepted. This foundation release intentionally registers no tools, so a connected client receives an empty `tools/list` result. Provider and unified-context tools will attach to this gateway in later slices.

Codex can read the bearer token from an environment variable:

```toml
[mcp_servers.context_layer]
url = "https://<web-domain>/api/mcp"
bearer_token_env_var = "CONTEXT_LAYER_TOKEN"
```

The Agent Setup page also provides copyable Claude, VS Code, and generic HTTP examples without embedding the token in committed configuration.

## Jira OAuth

Jira is the first registered provider. The workspace owner connects Jira, chooses one Jira Cloud site, and selects a workspace-wide project allowlist. Every workspace member authorizes their own Atlassian account; provider calls use that member's encrypted OAuth credentials and remain constrained by both the allowlist and Jira's own permissions.

Create a resource-level OAuth 2.0 integration in the Atlassian Developer Console. Enable the Jira Platform and User Identity APIs, configure the scopes used by the API adapter, and register this exact local callback:

```text
http://localhost:3000/api/integrations/jira/oauth/callback
```

Then configure both values:

```text
ATLASSIAN_OAUTH_CLIENT_ID=...
ATLASSIAN_OAUTH_CLIENT_SECRET=...
```

If both are absent, the core application still starts and Jira is omitted from the catalogue. Supplying only one is rejected. The callback is derived from `PUBLIC_APP_URL`, so a deployed environment must register `${PUBLIC_APP_URL}/api/integrations/jira/oauth/callback`. Use distinct Atlassian apps when local and production environments require different registered callbacks.

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
| `pnpm email:dev`          | Preview shared email templates on port 3001   |

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
- `AUTH_EMAIL_FROM`, `RESEND_API_KEY` — use a sender on a domain verified in
  Resend. The `resend.dev` test sender can deliver only to the email address on
  your Resend account, so it cannot be used for workspace invitations to other
  people.
- `CREDENTIAL_ENCRYPTION_KEY`
- `PUBLIC_APP_URL`
- Optional pair: `ATLASSIAN_OAUTH_CLIENT_ID`, `ATLASSIAN_OAUTH_CLIENT_SECRET`

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
  ATLASSIAN_OAUTH_CLIENT_ID=<secret>
  ATLASSIAN_OAUTH_CLIENT_SECRET=<secret>
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
