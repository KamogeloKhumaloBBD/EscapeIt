/**
 * Renders the real digest email from real activity, straight to an HTML file.
 * Nothing is sent and nothing is written to the database, so the email's
 * structure can be iterated on without mailing anyone.
 *
 * Usage:
 *   pnpm digest:preview                every webhook event in the database
 *   pnpm digest:preview -- --days 7    only the last seven days
 *   pnpm digest:preview -- --plain     skip the model, show the fallback
 *
 * Expects llama-server on SLM_BASE_URL (default http://127.0.0.1:8085) unless
 * --plain is passed. Writes to apps/api/scripts/.digest-preview.html.
 *
 * It lives in the API workspace rather than at the repository root because it
 * uses the same provider definitions and summarizer a real send does, and only
 * this workspace has those dependencies.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createDatabaseConnection,
  parseDatabaseConfig,
  type ActivityEvent,
} from "@context-layer/db";
import { dailyDigestEmail, renderEmail } from "@context-layer/email";
import {
  bitbucketDefinition,
  confluenceDefinition,
  githubDefinition,
  jiraDefinition,
} from "@context-layer/integrations";
import {
  groupDigestEvents,
  renderDigestGroups,
} from "../src/integrations/summarizer/digest-summarizer";
import { createLlamaServerSummarizer } from "../src/integrations/summarizer/llama-server-summarizer";

// The same definitions the API composes, so link building is exercised here
// exactly as it is in a real send.
const definitions = [
  bitbucketDefinition,
  confluenceDefinition,
  githubDefinition,
  jiraDefinition,
];

const outputPath = path.join(
  process.cwd(),
  "apps",
  "api",
  "scripts",
  ".digest-preview.html",
);
const baseUrl = process.env.SLM_BASE_URL ?? "http://127.0.0.1:8085";
const usePlain = process.argv.includes("--plain");
const daysArgument = process.argv.indexOf("--days");
const days =
  daysArgument === -1 ? null : Number(process.argv[daysArgument + 1] ?? "");

interface WorkspaceActivity {
  events: ActivityEvent[];
  resourceUrls: Map<string, string | null>;
  workspaceName: string;
}

async function loadActivity(): Promise<WorkspaceActivity> {
  const connection = createDatabaseConnection(parseDatabaseConfig(process.env));

  try {
    const workspaces = await connection.client<
      { id: string; name: string }[]
    >`select id, name from workspaces order by "createdAt" limit 1`;
    const workspace = workspaces[0];

    if (workspace === undefined) {
      throw new Error("No workspace exists in this database.");
    }

    // The same filter the digest itself applies: only provider activity, never
    // the workspace administering itself.
    const events = await connection.client<ActivityEvent[]>`
      select *
      from activity_events
      where
        "workspaceId" = ${workspace.id}
        and category = 'webhook'
        and status = 'succeeded'
        ${
          days === null || Number.isNaN(days)
            ? connection.client``
            : connection.client`and "occurredAt" >= now() - ${`${String(days)} days`}::interval`
        }
      order by "occurredAt", id
    `;

    const resources = await connection.client<
      { provider: string; url: string | null }[]
    >`
      select provider, configuration ->> 'url' as url
      from integrations
      where "workspaceId" = ${workspace.id}
    `;

    return {
      events,
      resourceUrls: new Map(resources.map((row) => [row.provider, row.url])),
      workspaceName: workspace.name,
    };
  } finally {
    await connection.close();
  }
}

const { events, resourceUrls, workspaceName } = await loadActivity();

if (events.length === 0) {
  console.log("No webhook activity found. Nothing to preview.");
  process.exit(0);
}

const groups = groupDigestEvents(
  events.map((event) => ({
    provider: event.provider,
    summary: event.summary,
  })),
);
const startedAt = process.hrtime.bigint();
const summarizer = usePlain
  ? null
  : createLlamaServerSummarizer({
      baseUrl,
      logger: {
        warn: (...args: unknown[]) => {
          console.warn(...args);
        },
      },
    });
const digest =
  (await summarizer?.summarize(groups)) ?? renderDigestGroups(groups);
const seconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

const seenLinks = new Set<string>();
const links = events.flatMap((event) => {
  const definition = definitions.find(
    (candidate) => candidate.key === event.provider,
  );
  const link = definition?.buildEventLink(
    event.metadata,
    resourceUrls.get(event.provider ?? "") ?? null,
  );

  if (link === undefined || link === null || seenLinks.has(link.url)) {
    return [];
  }

  seenLinks.add(link.url);

  return [{ ...link, source: event.provider ?? "workspace" }];
});

const html = await renderEmail(
  dailyDigestEmail({
    dashboardUrl: "http://localhost:3000/dashboard",
    digest,
    eventCount: events.length,
    links,
    periodLabel: new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
      weekday: "long",
    }).format(new Date()),
    workspaceName,
  }),
);

await writeFile(outputPath, html, "utf8");

console.log(`Source:  ${usePlain ? "no model (plain fallback)" : baseUrl}`);
console.log(
  `Events:  ${String(events.length)} across ${String(groups.length)} tools`,
);
console.log(`Took:    ${seconds.toFixed(1)}s`);
console.log("");
console.log("─".repeat(72));
console.log(digest);
console.log("─".repeat(72));
console.log("");
console.log(`Links:   ${String(links.length)}`);

for (const link of links) {
  console.log(`  ${link.source} "${link.label}" -> ${link.url}`);
}

console.log("");
console.log(`Open:    ${outputPath}`);
