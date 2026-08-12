# Context Layer

Context Layer is a pnpm monorepo containing an independently deployable Next.js frontend, Express API, and PostgreSQL infrastructure. Better Auth owns authentication, raw SQL repositories own product persistence, and Flyway is the only migration path.

## Requirements

- Node.js 24.18.0 LTS
- pnpm 11.21.0
- Docker Desktop or another Compose-compatible runtime
- A Resend API key and verified sender for passwordless sign-in
- An Atlassian OAuth 2.0 app when developing the Jira or Confluence integrations

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

See the importable [DBML schema](docs/database-schema.dbml) for the complete
table, relationship, constraint, and security-invariant reference.

Better Auth users may be signed in without a workspace. The onboarding flow creates a workspace and its owner membership atomically. Workspace owners can invite members by email from `/members`; recipients sign in passwordlessly and accept through the emailed link. Each user can belong to only one workspace.

The Express workspace API exposes authenticated workspace, member, and invitation endpoints. Next.js calls these endpoints from Server Components and Server Actions; it never accesses PostgreSQL directly. Invitation links expire after seven days, only their SHA-256 hashes are stored, and the signed-in email must match before acceptance.

The authenticated application uses a shared workspace shell. The dashboard derives setup progress, connection health, counts, and recent activity from real API data rather than frontend placeholders.

The product schema includes workspaces, memberships, invitations, workspace provider installations, member-specific provider accounts, selected provider scopes, enabled integration MCP tools, MCP token hashes, notification channels, per-member notification preference overrides, and correlated activity events.

- Providers are registered in API code using stable keys and capability metadata. Jira, Bitbucket, Confluence, and Teams are intended initial adapters, not database-level special cases.
- Provider installation configuration is workspace-wide; member account credentials remain member-specific.
- Notification-channel and provider credentials are stored only as authenticated AES-256-GCM envelopes.
- Integration-account and channel IDs are allocated before encryption because each envelope is cryptographically bound to its record ID and purpose.
- Provider scopes and MCP tools are deny-by-default: an empty resource allowlist grants no resource access, and an empty tool allowlist exposes no provider tools.
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

MCP requests always run as the membership that created the token. Better Auth cookies, query-string tokens, and client-supplied workspace identities are not accepted. Tools are discovered per request from the integrations available to that member. Workspace owners explicitly choose the MCP tools enabled for each integration, and those choices apply to every member token while remaining constrained by each member's provider identity. A disconnected provider, disconnected personal account, empty resource allowlist, or empty tool allowlist contributes no tools. Tool choices are retained when an integration is disconnected but remain unavailable until it is ready again.

When Jira is ready, the gateway can expose fourteen individually selected tools:

- `jira_get_issue`
- `jira_search_issues`
- `jira_get_assigned_issues`
- `jira_get_issue_comments`
- `jira_list_projects`
- `jira_get_create_metadata`
- `jira_get_issue_changelog`
- `jira_get_issue_transitions`
- `jira_get_issue_worklogs`
- `jira_list_issue_attachments`
- `jira_get_issue_attachment`
- `jira_create_issue`
- `jira_add_comment`
- `jira_transition_issue`

Jira search accepts structured filters rather than raw JQL. The API builds bounded JQL internally and always adds the workspace's selected Jira project IDs. Results and mutations are additionally constrained by the token owner's Jira permissions. Write tools are labeled in the owner UI and carry MCP write/destructive annotations so clients can present approval UX.

Responses contain normalized, bounded fields instead of raw Jira payloads. Atlassian document descriptions and comments retain compatible plain text and add bounded Markdown rendering. Attachment retrieval is read-only: UTF-8 text and Markdown are decoded, PDF and DOCX files are converted to bounded extracted text, and PNG, JPEG, GIF, or WebP images can be returned inline. Source attachments are capped at 10 MiB, inline images at 5 MiB, and extracted text at 50,000 characters. SVG, archives, legacy DOC, executables, unsupported formats, and oversized files are rejected; attachment bytes are never persisted or logged.

When Confluence is ready, the gateway can expose eleven individually selected tools:

- `confluence_list_spaces`
- `confluence_list_pages`
- `confluence_get_page`
- `confluence_search_pages`
- `confluence_get_page_children`
- `confluence_get_page_comments`
- `confluence_list_page_attachments`
- `confluence_get_page_attachment`
- `confluence_create_page`
- `confluence_update_page`
- `confluence_add_page_comment`

Confluence pages are limited to the workspace's selected space IDs and the invoking member's own Confluence permissions. Search accepts structured title and text filters; the adapter builds bounded CQL internally and never accepts arbitrary CQL. Page bodies and comments return normalized plain text and bounded Markdown. Write tools can create published pages, update a page title or body with optimistic version checks, and add footer comments. Drafts, moves, ownership changes, deletion, and uploads are not exposed. Confluence attachment retrieval uses the same type and size policies as Jira, validates page and space ownership first, and follows only a single credential-free redirect to an Atlassian-controlled media host.

Codex can read the bearer token from an environment variable:

```toml
[mcp_servers.context_layer]
url = "https://<web-domain>/api/mcp"
bearer_token_env_var = "CONTEXT_LAYER_TOKEN"
```

The Agent Setup page also provides copyable Claude, VS Code, and generic HTTP examples without embedding the token in committed configuration.

## Atlassian OAuth

Jira and Confluence share the configured Atlassian OAuth application but maintain separate workspace installations, member credentials, scopes, and MCP-tool selections. The workspace owner selects one site during each provider's resource-level consent flow, then chooses a workspace-wide project or space allowlist. Every member authorizes their own Atlassian account for each provider; calls use that member's encrypted OAuth credentials and remain constrained by both the workspace allowlist and Atlassian's permissions. OAuth access tokens are refreshed shortly before expiry and rotating refresh tokens are replaced atomically.

Create a resource-level OAuth 2.0 integration in the Atlassian Developer Console. Enable the Jira Platform, Confluence, and User Identity APIs; configure the Jira scopes documented by the adapter plus `read:space:confluence`, `read:page:confluence`, `read:comment:confluence`, `read:attachment:confluence`, `search:confluence`, `write:page:confluence`, and `write:comment:confluence`; and register both exact local callbacks:

```text
http://localhost:3000/api/integrations/jira/oauth/callback
http://localhost:3000/api/integrations/confluence/oauth/callback
```

Then configure both values:

```text
ATLASSIAN_OAUTH_CLIENT_ID=...
ATLASSIAN_OAUTH_CLIENT_SECRET=...
```

If both are absent, the core application still starts and both Atlassian providers are omitted from the catalogue. Supplying only one is rejected. Callbacks are derived from `PUBLIC_APP_URL`, so a deployed environment must register both `${PUBLIC_APP_URL}/api/integrations/jira/oauth/callback` and `${PUBLIC_APP_URL}/api/integrations/confluence/oauth/callback`. Use distinct Atlassian apps when local and production environments require different registered callbacks. Configure the Confluence API scopes and callback before deploying code that registers the provider. Accounts authorized before Confluence write scopes were enabled must reconnect before invoking write tools.

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
