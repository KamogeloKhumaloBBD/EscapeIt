# Context Layer repository instructions

## Architecture

- `apps/web` is the Next.js frontend. It must call the backend through `/api` and must never import `@context-layer/db`.
- `apps/api` is the independently deployable Express control plane and owns authentication, application APIs, MCP token/connection management, webhooks, and notification operations. During the staged MCP cutover it also retains the legacy MCP gateway as a rollback path.
- `apps/mcp` is the independently deployable Express MCP execution plane. It owns the primary `/api/mcp` and protected-resource discovery handlers and must remain stateless so Railway replicas need no session affinity.
- `packages/db` owns PostgreSQL connectivity and future Flyway SQL migrations. It must not import any application.
- `packages/email` owns shared React Email templates. Email senders must compose these templates instead of embedding feature-specific HTML or text bodies.
- `packages/integrations` owns provider definitions, adapters, account execution, and MCP tools shared by the API and MCP service. `packages/security` owns the shared credential-envelope boundary, and `packages/mcp-runtime` owns shared MCP protocol handling during the staged cutover.
- Use pnpm for all dependency and script operations. Do not use npm or yarn to modify this repository.

## Development workflow

- Run commands from the repository root unless a command explicitly says otherwise.
- Use `pnpm dev:full` for the complete local stack, `pnpm verify` before handoff, and `pnpm docker:build` when deployment artifacts change.
- `pnpm lint` and `pnpm format:check` are read-only checks. Use the explicit `:fix` or `format` commands only when edits are intended.
- Keep every application independently buildable and deployable.

## APIs and dependencies

- Express owns `/api/*`; do not add Next.js route handlers for application APIs. Next.js rewrites the exact MCP paths to `apps/mcp` and all remaining API paths to `apps/api`.
- Organize backend behavior by feature with the flow `route -> service/use case -> repository or provider adapter`.
- Routes translate HTTP only, services orchestrate business use cases, repositories own raw SQL and transaction boundaries, and provider adapters own external-provider behavior.
- Compose functional factories explicitly in `server.ts`. Do not add a dependency-injection framework or `BaseController`, `BaseService`, or `BaseRepository` abstractions.
- Add an interface only at a genuinely replaceable boundary. Do not branch on provider keys in generic controllers or workspace services.
- Keep browser requests on relative `/api` paths so the frontend proxy preserves a first-party origin.
- Next.js Server Actions may validate and orchestrate UI mutations, but must call Express for authentication, authorization, business logic, provider access, and persistence. They are not a second backend.
- Express must independently validate and authorize every mutation; frontend and Server Action validation is only an additional user-facing boundary.
- Prefer shared packages only when code is genuinely used by more than one workspace. Do not create speculative packages.
- Preserve ESM throughout the repository.
- Use extensionless relative imports in TypeScript source. The API and database package are bundled for production; do not write compiled `.js` suffixes in `.ts` imports.
- Keep raw SQL inside `packages/db`; API services and routes must not embed queries.

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

## UI components

- Before creating a UI primitive or interaction, search or inspect the configured shadcn registry and review its API and examples.
- Prefer installing and composing the official component for the configured `radix-sera` style. Do not hand-wrap Radix when shadcn already provides the primitive.
- Keep registry components in `apps/web/components/ui` and feature compositions outside that directory.
- Create a custom primitive only when the registry has no suitable component. Document why when it overlaps an existing registry category.
- Use Phosphor icons consistently in authenticated product UI.

## Database safety

- Do not introduce product tables, enums, relations, or SQL migrations until the schema is explicitly approved.
- Never run migrations implicitly during application startup.
- Production migrations must be explicit, reviewed SQL files and run separately with Flyway migration credentials.
- Never seed product or mock data into the development database.

## Product data invariants

- A Better Auth user may have no workspace and may belong to at most one workspace. Authentication must not create a workspace implicitly.
- Workspace creation must atomically create one owner membership. Roles are limited to `owner` and `member`.
- Invitation tokens and MCP tokens are persisted only as SHA-256 hashes. Invitation acceptance must match the signed-in user's normalized email and revoke that email's other pending invitations.
- MCP tokens are personal capabilities. Every MCP request must execute as the token's `createdByMembershipId` and use only that member's provider credentials; never substitute an owner's or another member's identity. Owners may audit and revoke workspace tokens but cannot recover them or impersonate their creators.
- The MCP gateway accepts bearer tokens only. Return a raw token only in its creation response, and never log raw tokens, token hashes, authorization headers, or MCP arguments.
- Register provider-prefixed MCP tools dynamically from the token creator's ready integrations. A disconnected installation, disconnected personal account, or empty scope allowlist must expose no tools for that provider.
- Provider MCP tools must return normalized, bounded data and enforce workspace scopes before returning provider resources. Unified-context orchestration calls provider services directly; it must not invoke this application's MCP tools recursively.
- Invitation links expire after seven days. Only owners may create, list, or revoke invitations; every member may view the workspace roster. Never include raw invitation tokens in API logs or persistence.
- A workspace has at most one installation for each provider. Individual provider identities and credentials belong to `integration_accounts`, not the shared installation.
- Providers are code-defined through the API registry. Use validated provider keys and namespaced scope/event keys; do not add provider-specific database enums, tables, routes, or UI branches when the registry or adapter boundary is sufficient.
- Initial providers such as Jira, Bitbucket, Confluence, and Teams are adapters, not architectural special cases. Adding an adapter should not require a database migration when it fits the existing capabilities.
- Integration scopes are an explicit workspace allowlist. No selected scopes means no provider resources are accessible.
- Notification preferences are sparse member overrides. The effective value comes from the stored override when present and otherwise from the provider event's registry default.
- Generate product identifiers as UUIDv7 strings in application code. Do not add database-side UUID generation.
- Provider configuration JSON must contain only non-secret values. Integration-account and notification-channel credentials must use the versioned AES-256-GCM envelope from the API security boundary.
- Allocate integration-account and notification-channel IDs before encryption because the record ID is authenticated as part of each credential envelope.
- Disconnection clears encrypted credentials and retains the connection record and activity history.
- A provider installation is workspace-wide, but OAuth accounts are membership-specific. Never use an owner's provider credentials for another member.
- Owners select shared installation resources and scope allowlists. Members may connect or disconnect only their own provider account and see shared configuration read-only.
- Effective provider access is the intersection of the workspace allowlist and the acting member's upstream provider permissions.
- OAuth callbacks must bind state to the authenticated membership, validate the selected provider resource, and persist replacement credentials only after the new connection is fully validated.
- OAuth access and rotating refresh tokens belong only in encrypted integration-account envelopes. Provider client IDs and secrets remain server-side deployment configuration.
- Authenticated product UI must be role-aware. Do not render owner-only mutations for members, but never rely on hidden controls as authorization enforcement.
- Repository methods must be tenant-scoped. Hash-based invitation acceptance and MCP-token resolution are the only lookup entry points that may begin without a workspace ID.

## Security

- Secrets remain server-side and must never use `NEXT_PUBLIC_*` names.
- Do not log credentials, connection strings, session material, raw provider errors, or tokens.
- Update relevant documentation whenever commands, public HTTP behavior, or environment variables change.
