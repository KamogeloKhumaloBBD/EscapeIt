# Context Layer

Context Layer is a pnpm monorepo containing an independently deployable Next.js frontend, Express API, and PostgreSQL infrastructure. Better Auth owns authentication, raw SQL repositories own product persistence, and Flyway is the only migration path.

## Requirements

- Node.js 24.18.0 LTS
- pnpm 11.21.0
- Docker Desktop or another Compose-compatible runtime
- A Resend API key and verified sender for passwordless sign-in
- An Atlassian OAuth 2.0 app when developing the Jira or Confluence integrations
- A Bitbucket Cloud OAuth consumer when developing the Bitbucket integration

## Start locally

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev:full
```

On PowerShell, use `Copy-Item .env.example .env`. Replace every placeholder in `.env` before starting.

- Web: <http://localhost:3000>
- Pricing: <http://localhost:3000/pricing>
- API health: <http://localhost:4000/api/health>
- MCP health: <http://localhost:4100/health>
- Proxied health: <http://localhost:3000/api/health>
- Onboarding: <http://localhost:3000/onboarding>
- Dashboard: <http://localhost:3000/dashboard>
- Integrations: <http://localhost:3000/integrations>
- Members: <http://localhost:3000/members>
- Agent Setup: <http://localhost:3000/agent-setup>

The browser uses relative `/api/*` paths. Next.js proxies the MCP execution and protected-resource paths to the MCP service and all other application paths to the Express API.

## Workspace

```text
apps/web       Next.js frontend
apps/api       Express API
apps/mcp       Stateless MCP execution service
packages/email Shared React Email templates
packages/db    PostgreSQL utilities and Flyway SQL migrations
packages/integrations Shared provider adapters and MCP tools
packages/security Shared credential-envelope boundary
```

## Data foundation

See the importable [DBML schema](docs/database-schema.dbml) for the complete
table, relationship, constraint, and security-invariant reference.

Better Auth users may be signed in without a workspace. The onboarding flow creates a workspace and its owner membership atomically. Workspace owners can invite members by email from `/members`; recipients sign in passwordlessly and accept through the emailed link. Each user can belong to only one workspace.

The Express workspace API exposes authenticated workspace, member, and invitation endpoints. Next.js calls these endpoints from Server Components and Server Actions; it never accesses PostgreSQL directly. Invitation links expire after seven days, only their SHA-256 hashes are stored, and the signed-in email must match before acceptance.

The authenticated application uses a shared workspace shell. Its analytics-first dashboard reads completed MCP activity from `GET /api/workspaces/current/analytics`, supports URL-backed browser-local date, integration, and owner-only member filters, compares with the preceding period, and shows role-scoped tool, provider, reliability, and activity insights. The dashboard passes the viewer's IANA time zone so date validation and daily buckets use local calendar boundaries; API callers that omit `timeZone` use UTC. Searchable, sortable ranking explorers use the paginated `/api/workspaces/current/analytics/rankings` endpoint. Owners receive workspace and per-member usage; members receive only their own usage. Setup and connection health remain visible when action is required.

The product schema includes workspaces, memberships, invitations, workspace provider installations, member-specific provider accounts, selected provider scopes, enabled integration MCP tools, governed Custom MCP servers and personal accounts, integration bundles and their provider/Custom MCP membership, MCP token hashes, notification channels, per-member notification preference overrides, and correlated activity events.

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

OAuth clients should send the MCP resource indicator shown by protected-resource discovery during authorization and token exchange. For compatibility with clients that omit it from the token request, the authorization server defaults an omitted token-request resource to its single code-defined MCP audience. It still rejects every explicitly supplied resource that does not exactly match `<PUBLIC_APP_URL>/api/mcp`.

Every workspace member can group the workspace's provider installations into a named bundle from `/bundles`. The member who creates a bundle owns and edits it, while every workspace member can view and use it; workspace owners may also delete any bundle for administration. A member can optionally scope a personal access token to one bundle when creating it from `/agent-setup`; that token's tools are then limited to the bundle's providers, intersected with the member's own connection and the workspace's existing tool allowlists. A token created without a bundle keeps today's behavior: every tool enabled across every provider the member has connected. A bundle cannot be deleted while a non-revoked token or MCP connection still references it.

### Custom MCP servers (Beta)

Workspace owners can install up to ten remote Streamable HTTP MCP endpoints from `/integrations`. Endpoints are immutable, public HTTPS URLs without embedded credentials; redirects and private, loopback, link-local, metadata, multicast, reserved, or DNS-rebound destinations are rejected. Legacy SSE, stdio, custom headers, mTLS, prompts, resources, and shared service credentials are not supported.

The API probes the MCP protocol and detects public, OAuth, or manual bearer access. Public servers are available to all members. OAuth and bearer credentials are always personal, encrypted with a record-bound AES-256-GCM envelope, and never shared with an owner or another member. OAuth follows MCP authorization discovery, PKCE, issuer validation, resource indicators, Client ID Metadata Documents at `/oauth/custom-mcp-client.json`, and Dynamic Client Registration fallback. The fixed callback is `${PUBLIC_APP_URL}/api/custom-mcp/oauth/callback`.

Owners explicitly refresh and approve the stored tool catalogue; new, changed, and missing tools are disabled until approved. `tools/list` uses this stored catalogue and never contacts the upstream server. Only `readOnlyHint: true` is presented as read-only. Each invocation intersects the active installation, approval, optional bundle membership, and the acting member's own connection, with 30-second calls and 256 KiB results. Archiving immediately removes bundle membership and irreversibly clears all member credentials while retaining audit history.

OAuth-connected MCP clients (approved from `/oauth/consent`, e.g. `claude mcp add --transport http`) can be scoped to a bundle too, chosen on the consent screen alongside Allow/Deny. Unlike personal tokens, an OAuth connection's bundle can be changed afterward from `/agent-setup`, which lists every connected client with a bundle switcher and a Revoke button. The change takes effect on the client's next request because the gateway re-resolves the connection's bundle live on every call. No client reconfiguration or reconnect is required to switch.

When Jira is ready, the gateway can expose fifteen individually selected tools:

- `jira_get_myself`
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

When Confluence is ready, the gateway can expose twelve individually selected tools:

- `confluence_get_myself`
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

Confluence pages are limited to the workspace's selected space IDs and the invoking member's own Confluence permissions. Search accepts structured title and text filters; the adapter builds bounded CQL internally and never accepts arbitrary CQL. Page bodies and comments return normalized plain text and bounded Markdown. Write tools accept a validated, bounded native Atlassian Document Format document and send it directly to Confluence, supporting headings, formatting, links, lists, quotes, code blocks, rules, and tables without using Markdown as an intermediate representation. Drafts, moves, ownership changes, deletion, and uploads are not exposed. Confluence attachment retrieval uses the same type and size policies as Jira, validates page and space ownership first, and follows only a single credential-free redirect to an Atlassian-controlled media host.

When Bitbucket is ready, the gateway can expose eleven individually selected read-only tools:

- `bitbucket_get_myself`
- `bitbucket_list_repositories`
- `bitbucket_get_repository`
- `bitbucket_list_commits`
- `bitbucket_get_commit`
- `bitbucket_get_file`
- `bitbucket_search_code`
- `bitbucket_list_pull_requests`
- `bitbucket_get_pull_request`
- `bitbucket_get_pull_request_diff`
- `bitbucket_list_pull_request_comments`

Bitbucket repositories, commits, files, and pull requests are limited to the workspace's selected repository allowlist, re-checked on every call, and further constrained by the invoking member's own Bitbucket permissions. Diffs and file content are bounded in bytes before download and in characters after decoding, with a `truncated` flag when a response was cut. Bitbucket has no write tools: unlike the Atlassian OAuth apps used for Jira and Confluence, a Bitbucket OAuth consumer's granted scopes are fixed at registration time in Bitbucket workspace settings and cannot be requested per authorization, so Context Layer cannot guarantee the underlying token is read-only at the OAuth layer — read-only tool exposure is therefore the actual enforcement boundary. See "Bitbucket OAuth" below for the scopes to register and how granted-but-unused scopes are surfaced.

Codex can read the bearer token from an environment variable:

```toml
[mcp_servers.context_layer]
url = "https://<web-domain>/api/mcp"
bearer_token_env_var = "CONTEXT_LAYER_TOKEN"
```

The Agent Setup page provides copyable OAuth setup guides for Codex, Claude Code, Kiro, Cursor, VS Code, and generic Streamable HTTP clients. Its legacy-token section also includes token-based Claude, VS Code, and generic HTTP examples without embedding the token in committed configuration.

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

Provider OAuth failures redirect back to the integration page with a stable, non-sensitive reason such as `account_access_required` or `permission_required`. The UI explains the recovery step without placing provider responses, authorization codes, state values, or internal request identifiers in the URL. In particular, members must authorize with a provider account that can access the workspace resource selected by the owner.

## Bitbucket OAuth

Bitbucket owners select one workspace during resource-level consent (workspace resource selection happens explicitly afterward, since members commonly belong to more than one Bitbucket workspace), then choose a workspace-wide repository allowlist. Every member authorizes their own Bitbucket account; calls use that member's encrypted OAuth credentials and remain constrained by both the workspace allowlist and Bitbucket's permissions.

Create an OAuth consumer under Bitbucket workspace settings (**Workspace settings → OAuth consumers → Add consumer**) and register the callback:

```text
http://localhost:3000/api/integrations/bitbucket/oauth/callback
```

Unlike the Atlassian OAuth app above, Bitbucket OAuth consumers do not accept a `scope` parameter per authorization request — whatever scopes are checked on the consumer are granted in full, every time, and Context Layer's code has no way to request a narrower subset. Check only the read-only scopes Context Layer's tools require: **Account** (read) and **Repositories** (read). Do not check any write scope; Context Layer never exposes Bitbucket write tools regardless of what the consumer grants, but keeping the consumer itself read-only avoids issuing tokens with more access than intended. If a consumer's checked scopes ever change, connected members must reconnect to receive a token reflecting the new grant. Whatever scopes a token actually carries are recorded in the `integration.account.connect` activity event and shown on the Bitbucket integration detail page, so an owner can verify the consumer wasn't configured too broadly.

Then configure both values:

```text
BITBUCKET_OAUTH_CLIENT_ID=...
BITBUCKET_OAUTH_CLIENT_SECRET=...
```

If either is absent, the core application still starts and Bitbucket is omitted from the catalogue. Supplying only one is rejected. The callback is derived from `PUBLIC_APP_URL`, so a deployed environment must register `${PUBLIC_APP_URL}/api/integrations/bitbucket/oauth/callback`. Use a distinct consumer when local and production environments require different registered callbacks.

## Notification health

Notification channel tests and webhook deliveries update the existing channel health fields. Rejected or invalid webhooks remain in an error state until an owner replaces the URL or runs a successful test. Temporary upstream and network failures remain connected, are retried on the next event, and clear automatically after a successful delivery. The integration page also warns when scopes, event selections, routing, or external provider approval prevent notifications from being delivered.

Request logs record URL paths without query values. OAuth authorization codes and state parameters must never be logged.

## Commands

| Command                   | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `pnpm dev:full`           | Start PostgreSQL, API, MCP, and Next.js         |
| `pnpm dev:web`            | Start Next.js                                   |
| `pnpm dev:api`            | Start Express                                   |
| `pnpm dev:mcp`            | Start the MCP execution service                 |
| `pnpm db:up`              | Start local PostgreSQL and wait for health      |
| `pnpm db:down`            | Stop PostgreSQL and preserve its named volume   |
| `pnpm db:migrate`         | Run reviewed Flyway migrations locally          |
| `pnpm db:railway:migrate` | Run Flyway against linked Railway Postgres      |
| `pnpm db:validate`        | Validate local Flyway migrations                |
| `pnpm db:info`            | Inspect local Flyway state                      |
| `pnpm test`               | Run focused application behavior tests          |
| `pnpm verify`             | Check formatting, linting, tests, types, builds |
| `pnpm docker:build`       | Build all production deployment images          |
| `pnpm email:dev`          | Preview shared email templates on port 3001     |

Migrations never run during web, API, or MCP startup. Product data is never seeded.

## Environment

Frontend server:

- `PUBLIC_APP_URL`: public Next.js origin
- `API_INTERNAL_URL`: server-side Express origin
- `MCP_INTERNAL_URL`: server-side MCP service origin
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
- `SLM_BASE_URL`, `SLM_API_KEY` — optional together; enable authenticated digest
  summarization over the private network when configured
- `DIGEST_RUN_SECRET` — optional bearer secret for the scheduled digest route
- `DIGEST_SEND_HOUR_UTC` — digest period boundary; defaults to `16`
- Optional pair: `ATLASSIAN_OAUTH_CLIENT_ID`, `ATLASSIAN_OAUTH_CLIENT_SECRET`
- Optional pair: `BITBUCKET_OAUTH_CLIENT_ID`, `BITBUCKET_OAUTH_CLIENT_SECRET`

MCP:

- `DATABASE_URL`, `DATABASE_SSL_MODE`
- `PORT` in hosted environments, or `MCP_PORT` locally
- `CREDENTIAL_ENCRYPTION_KEY`, `PUBLIC_APP_URL`
- The same configured Atlassian, Bitbucket, and GitHub client credentials as API, so provider access tokens can be refreshed during tool execution

Local Compose additionally uses `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_PORT`. See `.env.example` for valid formats.

## Railway

Railway runs `web`, `api`, `mcp`, `flyway`, `slm`, `digest-cron`, and `Postgres` in one project. The application service manifests are `railway.web.json`, `railway.api.json`, `railway.mcp.json`, `railway.flyway.json`, `railway.slm.json`, and `railway.digest-cron.json`.

Use these service configuration paths in Railway and keep the repository root as each build context. Configure:

```text
web
  API_INTERNAL_URL=http://api.railway.internal:4000
  MCP_INTERNAL_URL=http://${{mcp.RAILWAY_PRIVATE_DOMAIN}}:${{mcp.PORT}}
  PUBLIC_APP_URL=https://<web-domain>
  PORT=3000

api
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  DATABASE_SSL_MODE=disable
  BETTER_AUTH_URL=https://<web-domain>
  PUBLIC_APP_URL=https://<web-domain>
  SLM_BASE_URL=http://${{slm.RAILWAY_PRIVATE_DOMAIN}}:${{slm.PORT}}
  SLM_API_KEY=${{slm.LLAMA_API_KEY}}
  DIGEST_RUN_SECRET=<random-secret-at-least-32-characters>
  DIGEST_SEND_HOUR_UTC=16
  ATLASSIAN_OAUTH_CLIENT_ID=<secret>
  ATLASSIAN_OAUTH_CLIENT_SECRET=<secret>
  PORT=4000

mcp
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  DATABASE_SSL_MODE=disable
  PUBLIC_APP_URL=https://<web-domain>
  CREDENTIAL_ENCRYPTION_KEY=${{api.CREDENTIAL_ENCRYPTION_KEY}}
  ATLASSIAN_OAUTH_CLIENT_ID=${{api.ATLASSIAN_OAUTH_CLIENT_ID}}
  ATLASSIAN_OAUTH_CLIENT_SECRET=${{api.ATLASSIAN_OAUTH_CLIENT_SECRET}}
  BITBUCKET_OAUTH_CLIENT_ID=${{api.BITBUCKET_OAUTH_CLIENT_ID}}
  BITBUCKET_OAUTH_CLIENT_SECRET=${{api.BITBUCKET_OAUTH_CLIENT_SECRET}}
  GITHUB_APP_CLIENT_ID=${{api.GITHUB_APP_CLIENT_ID}}
  GITHUB_APP_CLIENT_SECRET=${{api.GITHUB_APP_CLIENT_SECRET}}
  GITHUB_APP_SLUG=${{api.GITHUB_APP_SLUG}}
  PORT=4100

flyway
  FLYWAY_URL=jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
  FLYWAY_USER=${{Postgres.PGUSER}}
  FLYWAY_PASSWORD=${{Postgres.PGPASSWORD}}
  FLYWAY_CONNECT_RETRIES=60
  RAILWAY_DOCKERFILE_PATH=packages/db/Dockerfile.flyway

slm
  PORT=8080
  LLAMA_API_KEY=<random-secret>

digest-cron
  DIGEST_RUN_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}/api/digests/run
  DIGEST_RUN_SECRET=${{api.DIGEST_RUN_SECRET}}

```

The `mcp` service has no public domain; web reaches it over Railway private networking while clients retain the canonical web origin. The `flyway` service uses `packages/db/Dockerfile.flyway`, has no domain or volume, and exits after applying migrations. The `slm` and `digest-cron` services also have no public domains; the latter runs at `0 16 * * *` and exits after one authenticated request. Keep GitHub autodeploy disabled for all six application services; the production GitHub Actions workflow deploys Flyway, SLM, API, MCP, web, and digest cron in that order. The Railway manifests intentionally omit watch patterns because GitHub Actions owns deployment selection and ordering. Each service is deployed only when its own inputs changed since its latest successful production revision.

Configure the private GitHub repository with:

- Required `main` branch check: `Verify`.
- Repository secret `RAILWAY_TOKEN`: a Railway project token scoped to the production environment.
- Repository variable `RAILWAY_PROJECT_ID`: the Railway project ID.
- Repository variable `PRODUCTION_WEB_URL`: the public HTTPS web origin.
- GitHub environment `production` for deployment tracking.

Pull requests and `main` pushes run `pnpm verify`. GitHub Actions does not build Docker images or test Flyway against a temporary database; Railway performs deployment builds, and developers must run `pnpm db:migrate` and `pnpm db:validate` locally whenever migrations change.

For releases, GitHub Actions checks the exact CI-verified revision and compares each service with its own latest successful Railway revision. It conditionally deploys Flyway, SLM, API, MCP, web, and digest cron in dependency order, skipping services whose deployment inputs did not change. Unknown or divergent history deploys the affected service defensively. Smoke checks run whenever at least one service deploys and validate the public web root, proxied API health, MCP discovery metadata, and the unauthenticated MCP challenge. Deployment logs are bounded on failure and must never contain credentials or connection strings.

MCP execution and protected-resource discovery are owned exclusively by `apps/mcp`. The API remains the OAuth authorization and integration control plane and does not mount fallback MCP handlers.

For an exceptional manual migration fallback, run:

```sh
railway run --service Postgres pnpm db:railway:migrate
```

The fallback requires an active Postgres TCP proxy and a `DATABASE_PUBLIC_URL`. Normal production migrations use Railway private networking and do not require a public database endpoint. Never edit an applied versioned migration, run `flyway repair` automatically, or attempt an automatic database rollback; ship forward-compatible corrective migrations instead.

Railway health checks require the configured `PORT`. If web cannot reach a backend, verify `API_INTERNAL_URL`, `MCP_INTERNAL_URL`, the lowercase `api` and `mcp` service names, and private networking. If auth cookies fail, confirm `BETTER_AUTH_URL` and `PUBLIC_APP_URL` exactly match the HTTPS web origin.

## Database safety

Local PostgreSQL stores data in the `context_layer_postgres_data` named volume. Changing `POSTGRES_PORT` also requires updating the port in local `DATABASE_URL`.

Production migrations are reviewed SQL files under `packages/db/migrations`, executed separately with Flyway credentials. V1 creates Better Auth's core tables; V2 adds the Context Layer tenancy and integration foundation. This repository does not run either migration during application startup.
