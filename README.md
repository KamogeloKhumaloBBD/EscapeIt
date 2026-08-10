# Context Layer

Context Layer is a pnpm monorepo with an independently deployable Next.js frontend, Express API, shared PostgreSQL infrastructure, and explicit Flyway migrations.

This foundation contains only the Better Auth core schema managed through Flyway. Product tables, integration tables, MCP token tables, and seed data are intentionally not present yet.

## Prerequisites

- Node.js 24.18.0 LTS
- pnpm 11.21.0
- Docker Desktop or another Compose-compatible runtime

## Workspace

```text
apps/web       Next.js frontend (port 3000)
apps/api       Express API (port 4000)
packages/db    PostgreSQL connection utilities and Flyway migrations
```

The browser uses relative `/api/*` paths. Next.js proxies those requests to the Express API through `API_INTERNAL_URL`.

## First launch

```sh
corepack enable
corepack prepare pnpm@11.21.0 --activate
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev:full
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp` if desired. Replace every placeholder secret before starting the applications. Corepack is optional but useful for activating the pinned pnpm version from `package.json`.

Open <http://localhost:3000>. The API health endpoint is available directly at <http://localhost:4000/api/health> and through the frontend proxy at <http://localhost:3000/api/health>.

Passwordless sign-in uses Better Auth email OTP and Resend. Set `RESEND_API_KEY` and `AUTH_EMAIL_FROM` before using `/sign-in`; auth requests still flow through the Express-owned `/api/auth/*` endpoints.

## Commands

| Command             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `pnpm db:up`        | Start PostgreSQL and wait for health              |
| `pnpm db:down`      | Stop PostgreSQL while preserving its named volume |
| `pnpm db:logs`      | Follow PostgreSQL logs                            |
| `pnpm db:migrate`   | Run Flyway migrations when reviewed SQL exists    |
| `pnpm db:validate`  | Validate Flyway migrations when SQL exists        |
| `pnpm db:info`      | Inspect Flyway state when SQL exists              |
| `pnpm dev:web`      | Start Next.js                                     |
| `pnpm dev:api`      | Start Express                                     |
| `pnpm dev:full`     | Start PostgreSQL, Express, and Next.js            |
| `pnpm verify`       | Check formatting, lint, types, and builds         |
| `pnpm docker:build` | Build both production images                      |

`pnpm install` configures Husky automatically. Every commit runs `pnpm verify`
and is rejected if formatting, linting, type checks, or either application build
fails.

`db:migrate`, `db:validate`, and `db:info` use the pinned `redgate/flyway:12.6.0` Docker image. Migrations are explicit SQL files in `packages/db/migrations`; the API and frontend never run migrations during startup.

## Database safety

Local PostgreSQL uses the persistent `context_layer_postgres_data` volume. `pnpm db:down` does not delete it. No product or mock data is seeded.

PostgreSQL binds to host port `5432` by default. If that port is already occupied, change `POSTGRES_PORT` and update `DATABASE_URL` to the same port.

For managed PostgreSQL, provide the managed `DATABASE_URL` and set `DATABASE_SSL_MODE` to `require` or `verify-full` when TLS is required. Production migrations must run as a separate Flyway deployment job with dedicated migration credentials; the API must not migrate during startup.

## Deployment

Both applications have independent multi-stage Dockerfiles:

```sh
docker build -f apps/api/Dockerfile -t context-layer-api .
docker build --build-arg API_INTERNAL_URL=https://api.internal.example -f apps/web/Dockerfile -t context-layer-web .
```

The frontend proxy destination is compiled into the Next.js server build. Supply the environment-specific internal API URL while building the frontend image.
