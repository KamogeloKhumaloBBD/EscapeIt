# Context Layer repository instructions

## Architecture

- `apps/web` is the Next.js frontend. It must call the backend through `/api` and must never import `@context-layer/db`.
- `apps/api` is the independently deployable Express backend and owns every HTTP API, authentication handler, MCP endpoint, webhook, and notification operation.
- `packages/db` owns PostgreSQL connectivity and future Flyway SQL migrations. It must not import either application.
- Use pnpm for all dependency and script operations. Do not use npm or yarn to modify this repository.

## Development workflow

- Run commands from the repository root unless a command explicitly says otherwise.
- Use `pnpm dev:full` for the complete local stack, `pnpm verify` before handoff, and `pnpm docker:build` when deployment artifacts change.
- `pnpm lint` and `pnpm format:check` are read-only checks. Use the explicit `:fix` or `format` commands only when edits are intended.
- Keep both applications independently buildable and deployable.

## APIs and dependencies

- Express owns `/api/*`; do not add Next.js route handlers for application APIs.
- Keep browser requests on relative `/api` paths so the frontend proxy preserves a first-party origin.
- Next.js Server Actions may validate and orchestrate UI mutations, but must call Express for authentication, authorization, business logic, provider access, and persistence. They are not a second backend.
- Express must independently validate and authorize every mutation; frontend and Server Action validation is only an additional user-facing boundary.
- Prefer shared packages only when code is genuinely used by more than one workspace. Do not create speculative packages.
- Preserve ESM throughout the repository.

## Next.js and React

- Use Server Components for pages, layouts, and server data access by default, but use Client Components whenever browser APIs, local interaction, form hooks, focus management, or optimistic UI make them the clearer choice.
- Keep `"use client"` boundaries at the smallest useful interactive component. Do not convert a parent page or layout solely because it renders a Client Component.
- Do not fetch initial page data in `useEffect` when a Server Component can load it, and do not use an ad hoc client request when a form Server Action is appropriate.
- Use React 19 `useActionState` for action results and `useFormStatus` in a component nested inside its form for submission state. Do not use the renamed `useFormState` alias.
- Validate every Server Action input on the server with Zod, even when the form also uses native HTML constraints. Action state must be serializable and contain only safe field errors and user-facing messages.
- Use the root Sonner toaster directly for transient success, warning, and general error feedback. Keep field validation inline and associated with the relevant control; do not create another toast abstraction.
- Use `loading.tsx` only for route segments with meaningful asynchronous work. Skeletons should match the loaded layout and respect reduced-motion preferences.
- Add explicit Suspense boundaries only around independent asynchronous regions that can stream separately. Do not wrap synchronous content or duplicate an existing route loading boundary.
- Authenticated and workspace-scoped reads default to `cache: "no-store"`. Any shared caching requires reviewed isolation keys and tags.
- After a successful mutation, use `updateTag` for immediate read-your-writes, `revalidateTag(tag, "max")` for stale-while-revalidate, and `revalidatePath` only when route-level output must be invalidated. Never revalidate before the mutation succeeds.

## Database safety

- Do not introduce product tables, enums, relations, or SQL migrations until the schema is explicitly approved.
- Never run migrations implicitly during application startup.
- Production migrations must be explicit, reviewed SQL files and run separately with Flyway migration credentials.
- Never seed product or mock data into the development database.

## Security

- Secrets remain server-side and must never use `NEXT_PUBLIC_*` names.
- Do not log credentials, connection strings, session material, raw provider errors, or tokens.
- Update relevant documentation whenever commands, public HTTP behavior, or environment variables change.
