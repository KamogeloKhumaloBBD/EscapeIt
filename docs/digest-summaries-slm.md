# Readable digests from a self-hosted small model

> **Status: built and working locally, not yet deployed.** Four things differ
> from the original plan, each recorded in the sections below: the digest is per
> workspace rather than per member, the model is Gemma 3 4B, the send window is
> anchored to the schedule rather than to the calendar day, and the email is a
> bullet per tool with the work it mentions linked.

Goal: turn raw `activity_events` rows into prose a human wants to read, sent as a
daily digest, with an owner-triggered "send it now" for the whole workspace.
The model runs on Railway next to our own services — no third-party inference
API, no per-token bill, no workspace content leaving our infrastructure.

Deferred until the Confluence ingestion work lands, since the digest is only as
good as the events feeding it.

## Why this use case survives CPU-only inference

The original estimate of 10–30 tokens/second was optimistic. Published figures
for a 4 vCPU cloud instance running llama.cpp at Q4_K_M are 8.37 tok/s for a 3B
model and 6.37 for a 3.8B one. Measured locally on four threads, a four-tool
digest took 47 seconds on Gemma 3 4B and 12 on Qwen3.5-2B.

That is unusable for a chat box and perfectly fine here:

- A digest is **batch**. Nobody is watching a cursor blink.
- Each digest is one sentence per connected tool, so a few dozen tokens each.
- The model **rewrites, it does not retrieve**. Every fact is already in the
  `activity_events` rows we hand it. The job is phrasing, which is the one thing
  small models are genuinely good at.

**The scaling limit is workspaces, not cost.** At roughly 50 seconds each and
run sequentially, a nightly pass covers about 70 workspaces an hour. That is
comfortable now and worth revisiting well before it isn't; the levers, in order
of cheapness, are more vCPU, the faster model, and only then concurrency.

Sending per workspace rather than per member is what buys most of that headroom:
a twenty-person workspace costs one inference instead of twenty.

If we later want interactive summarisation, that is a different problem with a
different answer. This document only covers the digest.

## The cost claim, honestly

"No cost other than having it running" is not quite how Railway bills. Railway
charges by resource-minute, so a container holding 2–3 GB of RAM every minute of
the month is a real line item — on the order of tens of dollars per month at
current published rates, on top of the API, web and Postgres services. Worth
checking against Railway's pricing page before committing, but it is not free.

What makes it near-free is **not running it 24/7**:

| Shape                    | When the model is resident         | Trade-off                                                          |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| Always-on service        | Always                             | Simplest. Pays for ~1400 idle minutes a day to use ~10.            |
| Cron-only service        | Only during the scheduled run      | Cheapest. The owner's "send now" has no model available on demand. |
| Always-on + app sleeping | Scheduled run, plus on any request | Recommended. Sleeps between runs, wakes on the manual trigger.     |

Recommendation: **app sleeping**. Cold start is a model load from local disk —
seconds, invisible inside a batch job — and the manual trigger keeps working
without us orchestrating service starts through the Railway API.

## Model

All figures are Q4_K_M GGUF. Verify licences against the model card before
shipping; several of these are not what people assume.

| Model                 | Params | ~Weights | Licence         | Note                                           |
| --------------------- | ------ | -------- | --------------- | ---------------------------------------------- |
| **Gemma 3 4B it**     | 4B     | 2.4 GB   | Gemma Terms     | **Chosen** on how its digests read.            |
| Qwen3.5-2B            | 2B     | 1.28 GB  | Apache 2.0      | 4× faster, slightly clumsier prose. Runner-up. |
| Qwen2.5-1.5B-Instruct | 1.5B   | ~1.1 GB  | Apache 2.0      | Smallest resident footprint.                   |
| Phi-4-mini-instruct   | 3.8B   | 2.49 GB  | MIT             | Largest file and slowest measured. Rejected.   |
| Llama 3.2 3B Instruct | 3B     | ~2.0 GB  | Llama Community | Naming and acceptable-use conditions attach.   |

Gemma and Qwen3.5-2B were compared on identical prompts against the same real
activity. Gemma's grammar is better — "Software Development **was** updated"
against Qwen's "Software Development updated" — and that decided it.

The costs of that choice, recorded so they are not rediscovered later:

- **Roughly four times slower**: 47s against 12s for the same four tools.
- **Twice the resident memory**, so twice the per-minute bill while awake.
- **Gemma Terms, not Apache 2.0.** Google's acceptable-use conditions apply to
  this deployment and should be read before the product is sold. This is the
  one open question the model choice carries.
- In one comparison run Gemma described `#2` as an **issue** when the event
  never said what `#2` was. Qwen did not. Both models invent under pressure; the
  guardrails in the next section are what keep it rare, not the model.

Swapping model is two build arguments in `apps/slm/Dockerfile`. Nothing in the
API knows which model is behind the endpoint.

## What the model actually needed

The prompt matters more than the model size, and the settings in
`llama-server-summarizer.ts` each fix an observed failure:

| Setting                                  | Failure it fixes                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| One request per tool                     | Asked for the whole digest at once, it put every tool on one line — one bullet.      |
| Grouping done in code, not by prompt     | Asked to group and phrase at once, it regrouped events wrongly.                      |
| Repeats counted in code                  | Handed three identical lines it reported "a new comment". Arithmetic is not its job. |
| Counts worded, not `(x3)`                | The symbol was ignored; "this happened 3 times" was kept.                            |
| `frequency_penalty` / `presence_penalty` | Without them it repeated its own last sentence until it hit the token limit.         |
| Example held in the system prompt        | Given as a prior conversation turn, it copied the example's fake repos into digests. |
| Placeholder verbs in the example         | A realistic example leaked: a pull request only commented on was reported as merged. |
| `enable_thinking: false`                 | Reasoning tokens never reach the digest but are still paid for at CPU speed.         |

Links follow the same principle. The email turns a reference like `#42` or
`KAN-1` into a link, but the URL is built in code from the event's own metadata
by that provider's `buildEventLink`, never from the model's sentence. A link can
therefore only ever point at something that actually happened. Where the model
does not mention the reference, the line simply renders without a link.

Two earlier prompts failed in opposite directions and are worth remembering:
rules alone produced transcription — the input read back with full stops — while
a looser prompt invented causes and relabelled pull requests as issues. The
working prompt sits between them and is pinned by the example.

## Runtime and deployment

- `llama.cpp`'s `llama-server` rather than Ollama. It exposes an
  OpenAI-compatible `/v1/chat/completions`, so the adapter is an ordinary HTTP
  client, and the image is far smaller than Ollama's.
- **Bake the GGUF into the image.** Downloading weights on first boot makes cold
  starts depend on a third-party host being up. A ~1 GB layer is the better
  trade.
- New Railway service (`railway.slm.json` + `apps/slm/Dockerfile`), reachable
  only on Railway's private network. It must not have a public domain — it has
  no authentication of its own.

## Where it plugs into our architecture

Per `AGENTS.md` this is a provider adapter, not an architectural special case:

```
scheduler ─▶ POST /api/digests/run        (bearer DIGEST_RUN_SECRET)
owner UI  ─▶ POST /api/digests/send-now   (session, owner-only)
                          │
                          ▼
                digest.service.ts
                ├─ digest-repository    → claims the run before sending
                ├─ activity-repository  → the window's events, per workspace
                ├─ summarizer adapter   → llama-server over private network
                └─ digest-email         → packages/email template
```

The scheduled route is only mounted when `DIGEST_RUN_SECRET` is set, so a
deployment without a scheduler exposes no way to trigger a run at all.

- `apps/api/src/integrations/summarizer/` holds the adapter. One narrow
  interface — `summarize(events) → string` — behind which the HTTP call lives.
  It is a genuinely replaceable boundary, so an interface is warranted here.
- `apps/api/src/features/digests/` holds the routes, service and schemas,
  following `route → service → repository`.
- Composed explicitly in `server.ts`. No DI container.

## Data

`activity_events` already carries everything the digest needs: `workspaceId`,
`actorMembershipId`, `provider`, `operation`, a machine-written `summary`,
`metadata` and `occurredAt`. No new read model required.

Only the `webhook` category feeds a digest. Every other category records the
workspace administering itself — accounts connected, scopes changed, channels
created — which reads as a configuration log rather than a summary of the day's
work. This was obvious only once a digest was built from real data.

One new table was needed, approved, and shipped as `V10__digest_runs.sql`:

- `digest_runs` — workspace, period start/end, trigger (`scheduled` or
  `manual`), sent count, timestamps. The unique constraint on
  `(workspaceId, periodStart)` is the idempotency key. It is claimed **before**
  anything is generated or sent, so a retried schedule or a second replica loses
  the race and does nothing; recording the run afterwards would leave both
  senders believing they were first. Do not rely on `numReplicas: 1` for this.

There is no `membershipId` in that key, because the digest is per workspace.

## Guardrails on the model output

The model must never be able to invent a fact or silently break the digest:

- Input is a compact structured list of the member's events. The prompt forbids
  adding anything not present and caps the output length.
- Validate before sending: non-empty, within length bounds, and containing no
  URL that was not in the input.
- **Deterministic fallback.** If the service is asleep and slow to wake, the
  request fails, or validation rejects the output, render the plain grouped
  event list through the same email template and send that. A less pretty digest
  ships; a broken one does not.
- Never log the prompt or completion — they carry provider content, which
  `AGENTS.md` already puts off-limits for logging.

Keeping inference on our own infrastructure means that content never reaches a
third party, which is the main argument for this shape over a hosted model.

## Decided

- **An owner's early send does not override a member's opt-out.** Off means off.
  The manual trigger changes _when_ the digest goes out, never _who_ gets it.
- **One digest per workspace, not per member.** "Here is what the team did"
  rather than "here is what you did", which people already know. It is also
  twenty times cheaper in a twenty-person workspace.
- **Fixed UTC send time** for the first version, `DIGEST_SEND_HOUR_UTC`,
  defaulting to 16 — 18:00 South African time, once the working day is over.
  Per-workspace times need a workspace timezone setting that does not exist yet.
- **The window is anchored to the send hour, not the calendar day.** Each run
  covers the 24 hours ending at that hour, so consecutive digests abut exactly.
  A calendar-day window sent at 18:00 would describe yesterday and silently drop
  every evening's work. Anchoring to the hour rather than to `now` also makes a
  retry compute the same window, which is what lets `digest_runs` recognise it.
  `DIGEST_SEND_HOUR_UTC` must match the scheduler's cron expression.
- **Empty digests are skipped by default, but it is a member toggle.** Two event
  keys in the existing registry, no migration:
  - `digest.daily` — default enabled
  - `digest.quiet-day` — default disabled; when a member enables it they get a
    short "nothing happened" note instead of silence

  These are ordinary `notification_preferences` rows, so the sparse-override and
  registry-default rules already apply.

## Iterating on the email

`pnpm digest:preview` renders the real template from the real database straight
to `apps/api/scripts/.digest-preview.html`, sending nothing and writing nothing.
It uses the same provider definitions and summarizer a real send does, so what
it shows is what would arrive.

```
pnpm digest:preview              every webhook event in the database
pnpm digest:preview -- --days 7  only the last seven days
pnpm digest:preview -- --plain   skip the model, show the deterministic fallback
```

Point `SLM_BASE_URL` at a local `llama-server` first. Comparing two models is
running it twice against two ports.

## Deploying it

1. Create a Railway service from `railway.slm.json`. Give it **no public
   domain**. Set `PORT=8080` and a random `LLAMA_API_KEY`; Serverless and the
   resource ceiling are already set in the manifest.
2. Set `SLM_BASE_URL` on the API service to the SLM service's private address,
   and reference the SLM's `LLAMA_API_KEY` as `SLM_API_KEY`.
3. Set a separate `DIGEST_RUN_SECRET` on the API service.
4. Create the private `digest-cron` service from
   `railway.digest-cron.json`. Give it the API's private digest URL and a
   reference to the API's `DIGEST_RUN_SECRET`. It runs at `0 16 * * *`, equal
   to `DIGEST_SEND_HOUR_UTC`, and exits after one authenticated request.

Expect the first request after a sleep to return 502 while the service wakes.
The summarizer retries once for exactly this reason; without it the digest would
fall back to plain text on every scheduled run, which looks identical to a model
that never worked.

## Still open

- **Rate limit on the manual trigger.** Once per workspace per hour is a
  reasonable starting point; without one an owner can mail their whole team on a
  loop.
