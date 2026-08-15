# Getting Confluence changes into Context Layer

Jira, GitHub and Bitbucket all push events to us. Confluence Cloud has no way for
an OAuth 2.0 (3LO) app to register a webhook, so every route below is a
workaround of some kind.

Each entry lists what it does and what it costs. No ranking — the constraints
are what they are, and which ones matter depends on what we are optimising for.

Verified against Atlassian documentation, developer community threads and the
Confluence Cloud changelog in August 2026. The open request for Confluence Cloud
webhook administration, [CONFCLOUD-36613][confcloud-36613], is still unresolved.

## At a glance

| #   | Route                          | Latency   | Customer setup    | Prerequisite            |
| --- | ------------------------------ | --------- | ----------------- | ----------------------- |
| 1   | CQL content search             | Interval  | None              | —                       |
| 2   | REST v2 `GET /pages`           | Interval  | None              | —                       |
| 3   | Confluence GraphQL             | Interval  | None              | Beta API                |
| 4   | Audit records API              | Interval  | None              | —                       |
| 5   | RSS feed                       | Interval  | None              | —                       |
| 6   | Automation rule                | Real-time | One rule per site | —                       |
| 7   | Forge Remote receivers         | Real-time | App install       | —                       |
| 8   | Forge app holding logic        | Real-time | App install       | —                       |
| 9   | Forge scheduled trigger        | 5 min min | App install       | —                       |
| 10  | Forge web trigger              | n/a       | App install       | —                       |
| 11  | Connect descriptor webhooks    | Real-time | App install       | —                       |
| 12  | Private install link           | n/a       | App install       | App unlicensed          |
| 13  | Org events / events-stream     | Interval  | Admin key         | Paid Atlassian Guard    |
| 14  | `/wiki/rest/webhooks/1.0/`     | Real-time | None              | Undocumented API        |
| 15  | Webhook Manager for Confluence | Real-time | App install + pay | Third-party app         |
| 16  | WebHooks for Confluence        | Real-time | App install + pay | Third-party app         |
| 17  | Zapier / Make / Workato        | Varies    | Customer wiring   | Their automation quota  |
| 18  | Data Center webhooks           | Real-time | Admin config      | Self-hosted Confluence  |
| 19  | Content watches + email        | Real-time | None              | Inbound mail processing |
| 20  | Data Pipeline export           | Hours     | Admin config      | Premium plan            |
| 21  | Teamwork Graph connector       | Interval  | None              | —                       |

---

## Poll from our backend

Uses the 3LO token we already hold. No install, no admin rights.

**1. CQL content search.** `lastmodified > cursor and space in (…)`, one call per
integration rather than per space. Covers pages and comments. This is the route
Zapier's Confluence trigger uses.

**2. REST v2 `GET /pages`.** Cursor pagination with sort by modified date.
Faster than v1, but returns pages and blogposts only — comments need a second
call. Known quirk: `sort` must be re-appended to the `next` URL.

**3. Confluence GraphQL API.** Fetches page and comment fields in one query,
reducing round trips. No subscriptions are exposed, so it is still polling.
Parts of the API remain in beta.

**4. Audit records API.** Date-filtered. Capped at 1000 records per request, and
returns audit entries rather than content, so what changed must be reconstructed
from log records.

**5. RSS feed.** `createrssfeed.action?types=page&sort=modified`, authenticated.
Includes comments and does not consume REST rate limits. Output is XML built for
human readers, not a stable API contract.

## Push, with no app to install

**6. Automation rule → Send web request.** Triggers exist for page published and
for comments added. Points at the per-integration URL we already generate, so
there is nothing to build on our side. One global rule covers every space.
Delivery is fire-and-forget: failures are recorded in the rule's audit log and
are not retried. Rule execution counts against the site's automation limits.

## Forge

The customer installs an app. A share link avoids a Marketplace listing.

**7. Forge Remote event receivers.** Declares `avi:confluence:created:page`,
`updated:page` and `created:comment`; Forge posts them to our endpoint. No app
logic runs on Atlassian — the manifest names our URL. A non-2xx response or a
timeout beyond 5 seconds is retried.

**8. Forge app holding the logic.** Same install and events, but the handler
runs on Atlassian and calls us. Adds a second runtime to write, deploy and
version.

**9. Forge scheduled trigger → remote.** Polling that runs on Atlassian's
infrastructure and invokes our backend. Shortest interval is five minutes.

**10. Forge web trigger.** A per-install URL for calling into Forge from
outside. Inbound only — not a mechanism for receiving content events.

## Connect

**11. Descriptor webhooks.** Declared in `atlassian-connect.json`. This is the
officially documented way for an app to receive Confluence events. Same install
cost as Forge; Atlassian is directing new development to Forge.

**12. Private install link.** Distribution rather than transport: an install
link shared from the developer console, skipping the Marketplace. Requires the
app to be unlicensed, unpriced, and never submitted for listing.

## Organization level

**13. Org events / events-stream.** One cursor-based stream covering page events
across an entire organisation. Requires an Atlassian Guard subscription (paid
add-on) or Enterprise Cloud with SSO, plus an organisation admin API key.

**14. `/wiki/rest/webhooks/1.0/`.** An undocumented endpoint that does register
webhooks. Atlassian staff describe it as internal, unsupported, and subject to
change without notice.

## Third-party products

**15. Webhook Manager for Confluence.** A Marketplace app that sends Confluence
events to a configured URL. Nothing to build on our side; the customer installs
and pays for it, and we depend on a vendor we do not control.

**16. WebHooks for Confluence.** Equivalent from a different vendor, with
templated payloads.

**17. Zapier / Make / Workato.** The customer connects their existing automation
tool to our URL. Consumes their task quota and adds a hop outside our
observability.

## Edge cases

**18. Data Center webhooks.** Confluence Data Center has admin-configured
webhooks natively. Applies only to self-hosted customers.

**19. Content watches + email parsing.** Watch spaces via the API, route
notification mail to an inbox, parse it. No stable identifiers; breaks when
Atlassian changes notification templates.

**20. Data Pipeline export.** Scheduled bulk export intended for analytics.
Premium plans only; latency measured in hours.

**21. Teamwork Graph connector.** Designed for contributing our data into
Atlassian's graph rather than reading changes out. Its connectors run on
schedules.

---

## Implementation note

Whichever transport is chosen, it feeds the existing shared receiver core in
`apps/api/src/features/webhooks/notification-receiver.ts`. A provider supplies a
`translate` function returning `{ card, eventKey, externalEventId, metadata }`,
and the core handles activity logging, deduplication, the event-key gate and
channel fan-out.

Options 6, 7, 11, 14, 15, 16 and 17 deliver over HTTP and can reuse the webhook
route unchanged. Options 1–5, 9 and 13 need a scheduler in front of the same
`translate`.

[confcloud-36613]: https://jira.atlassian.com/browse/CONFCLOUD-36613
