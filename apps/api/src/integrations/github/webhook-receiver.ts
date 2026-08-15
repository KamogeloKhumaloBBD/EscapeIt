import { createHmac, timingSafeEqual } from "node:crypto";

import {
  parseNotificationEventKey,
  type JsonObject,
  type NotificationEventKey,
} from "@context-layer/db";
import { z } from "zod";

import { githubProvider } from "@context-layer/integrations";
import type {
  NotificationCard,
  NotificationCardFact,
} from "../notification-channel-adapter";
import {
  createNotificationWebhookReceiver,
  type NotificationWebhookReceiverDependencies,
  type ResolvedWebhookIntegration,
  type TranslatedWebhookEvent,
} from "../../features/webhooks/notification-receiver";
import {
  readHeader,
  WebhookReceiverError,
  type WebhookHeaders,
  type WebhookReceiver,
} from "../../features/webhooks/webhook-receiver";

const maximumCommentCharacters = 400;

const repositorySchema = z.object({
  full_name: z.string().min(1),
  html_url: z.url().optional(),
  id: z.number().int().positive().optional(),
});

const pullRequestEventSchema = z.object({
  action: z.string().min(1),
  pull_request: z.object({
    html_url: z.url().optional(),
    merged: z.boolean().default(false),
    number: z.number().int(),
    title: z.string().default(""),
    user: z.object({ login: z.string().min(1) }).optional(),
  }),
  repository: repositorySchema,
});

const issuesEventSchema = z.object({
  action: z.string().min(1),
  issue: z.object({
    html_url: z.url().optional(),
    number: z.number().int(),
    title: z.string().default(""),
    user: z.object({ login: z.string().min(1) }).optional(),
  }),
  repository: repositorySchema,
});

const issueCommentEventSchema = z.object({
  action: z.string().min(1),
  comment: z.object({
    body: z.string().nullable().default(null),
    html_url: z.url().optional(),
    user: z.object({ login: z.string().min(1) }).optional(),
  }),
  issue: z.object({
    number: z.number().int(),
    title: z.string().default(""),
  }),
  repository: repositorySchema,
});

const pushEventSchema = z.object({
  commits: z.array(z.object({ message: z.string().default("") })).default([]),
  pusher: z.object({ name: z.string().min(1) }).optional(),
  ref: z.string().default(""),
  repository: repositorySchema,
});

const pullRequestOpenedKey = parseNotificationEventKey(
  "github.pull-request-opened",
);
const pullRequestMergedKey = parseNotificationEventKey(
  "github.pull-request-merged",
);
const issueOpenedKey = parseNotificationEventKey("github.issue-opened");
const issueCommentedKey = parseNotificationEventKey("github.issue-commented");
const pushKey = parseNotificationEventKey("github.push");

function truncate(value: string, limit: number): string {
  const collapsed = value.replaceAll(/\s+/gu, " ").trim();

  return collapsed.length <= limit
    ? collapsed
    : `${collapsed.slice(0, limit - 1)}…`;
}

function card(
  repositoryFullName: string,
  summary: string,
  facts: readonly NotificationCardFact[],
  actionUrl: string | undefined,
): NotificationCard {
  return {
    ...(actionUrl === undefined ? {} : { actionUrl }),
    facts,
    summary,
    title: `GitHub · ${repositoryFullName}`,
  };
}

function translatePullRequest(
  payload: unknown,
  externalEventId: string,
): TranslatedWebhookEvent | null {
  const parsed = pullRequestEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const { action, pull_request: pullRequest, repository } = parsed.data;
  const reference = `#${String(pullRequest.number)}`;

  // "closed" arrives for both merges and abandoned pull requests; only the
  // merged flag distinguishes them, and an unmerged close is not an event we
  // model.
  let eventKey: NotificationEventKey;
  let verb: string;

  if (action === "opened" || action === "reopened") {
    eventKey = pullRequestOpenedKey;
    verb = "opened";
  } else if (action === "closed" && pullRequest.merged) {
    eventKey = pullRequestMergedKey;
    verb = "merged";
  } else {
    return null;
  }

  return {
    card: card(
      repository.full_name,
      `Pull request ${reference} ${verb} in ${repository.full_name}`,
      [
        { title: "Pull request", value: `${reference} — ${pullRequest.title}` },
        { title: "Repository", value: repository.full_name },
        ...(pullRequest.user === undefined
          ? []
          : [{ title: "Author", value: pullRequest.user.login }]),
      ],
      pullRequest.html_url,
    ),
    eventKey,
    externalEventId,
    metadata: {
      action,
      merged: pullRequest.merged,
      number: pullRequest.number,
      repository: repository.full_name,
    } satisfies JsonObject,
  };
}

function translateIssues(
  payload: unknown,
  externalEventId: string,
): TranslatedWebhookEvent | null {
  const parsed = issuesEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const { action, issue, repository } = parsed.data;

  if (action !== "opened" && action !== "reopened") {
    return null;
  }

  const reference = `#${String(issue.number)}`;

  return {
    card: card(
      repository.full_name,
      `Issue ${reference} opened in ${repository.full_name}`,
      [
        { title: "Issue", value: `${reference} — ${issue.title}` },
        { title: "Repository", value: repository.full_name },
        ...(issue.user === undefined
          ? []
          : [{ title: "Author", value: issue.user.login }]),
      ],
      issue.html_url,
    ),
    eventKey: issueOpenedKey,
    externalEventId,
    metadata: {
      action,
      number: issue.number,
      repository: repository.full_name,
    } satisfies JsonObject,
  };
}

function translateIssueComment(
  payload: unknown,
  externalEventId: string,
): TranslatedWebhookEvent | null {
  const parsed = issueCommentEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const { action, comment, issue, repository } = parsed.data;

  if (action !== "created") {
    return null;
  }

  const reference = `#${String(issue.number)}`;

  return {
    card: card(
      repository.full_name,
      `New comment on ${reference} in ${repository.full_name}`,
      [
        { title: "Issue", value: `${reference} — ${issue.title}` },
        { title: "Repository", value: repository.full_name },
        {
          title: "Comment",
          value:
            comment.body === null
              ? "(no text)"
              : truncate(comment.body, maximumCommentCharacters),
        },
      ],
      comment.html_url,
    ),
    eventKey: issueCommentedKey,
    externalEventId,
    metadata: {
      action,
      number: issue.number,
      repository: repository.full_name,
    } satisfies JsonObject,
  };
}

function translatePush(
  payload: unknown,
  externalEventId: string,
): TranslatedWebhookEvent | null {
  const parsed = pushEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const { commits, pusher, ref, repository } = parsed.data;

  // Branch deletions and tag pushes arrive as pushes with no commits; there is
  // nothing useful to show for them.
  if (commits.length === 0) {
    return null;
  }

  const branch = ref.replace(/^refs\/heads\//u, "");
  const count = commits.length;

  return {
    card: card(
      repository.full_name,
      `${String(count)} commit${count === 1 ? "" : "s"} pushed to ${branch} in ${repository.full_name}`,
      [
        { title: "Repository", value: repository.full_name },
        { title: "Branch", value: branch },
        ...(pusher === undefined
          ? []
          : [{ title: "Pushed by", value: pusher.name }]),
        {
          title: "Latest",
          value: truncate(
            commits.at(-1)?.message ?? "",
            maximumCommentCharacters,
          ),
        },
      ],
      repository.html_url,
    ),
    eventKey: pushKey,
    externalEventId,
    metadata: {
      branch,
      commitCount: count,
      repository: repository.full_name,
    } satisfies JsonObject,
  };
}

export function translateGitHubWebhookEvent(
  payload: unknown,
  headers: WebhookHeaders,
): TranslatedWebhookEvent | null {
  const event = readHeader(headers, "x-github-event");
  const delivery = readHeader(headers, "x-github-delivery");

  if (event === null || delivery === null) {
    throw new WebhookReceiverError("invalid_payload");
  }

  switch (event) {
    case "issue_comment":
      return translateIssueComment(payload, delivery);
    case "issues":
      return translateIssues(payload, delivery);
    case "pull_request":
      return translatePullRequest(payload, delivery);
    case "push":
      return translatePush(payload, delivery);
    default:
      // `ping` and any event GitHub adds later are acknowledged and ignored.
      return null;
  }
}

const installationPayloadSchema = z.object({
  installation: z.object({ id: z.number().int().positive() }),
  repository: z
    .object({
      id: z.union([z.string(), z.number()]).transform(String),
    })
    .optional(),
});

export interface GitHubWebhookReceiverDependencies extends NotificationWebhookReceiverDependencies {
  /**
   * Resolves every workspace connected to a GitHub App installation id and
   * the stable repository ids each workspace owner selected.
   */
  findIntegrationByInstallationId: (installationId: string) => Promise<
    | readonly (ResolvedWebhookIntegration & {
        selectedRepositoryIds: readonly string[];
      })[]
    | null
  >;
  /**
   * The secret configured on the GitHub App's webhook. Null disables GitHub
   * notifications rather than accepting unauthenticated deliveries.
   */
  webhookSecret: string | null;
}

function signatureMatches(
  rawBody: Buffer,
  headers: WebhookHeaders,
  secret: string,
): boolean {
  const provided = readHeader(headers, "x-hub-signature-256");

  if (provided === null) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);

  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

export function createGitHubWebhookReceiver({
  findIntegrationByInstallationId,
  webhookSecret,
  ...dependencies
}: GitHubWebhookReceiverDependencies): WebhookReceiver {
  return createNotificationWebhookReceiver({
    ...dependencies,
    provider: githubProvider,
    async resolve({ headers, payload, rawBody }) {
      // One webhook serves every installation of the App, so the delivery URL
      // carries no secret; the signature is the only proof of origin.
      if (webhookSecret === null) {
        return null;
      }

      if (!signatureMatches(rawBody, headers, webhookSecret)) {
        return null;
      }

      const parsed = installationPayloadSchema.safeParse(payload);

      if (!parsed.success) {
        return null;
      }

      const integrations = await findIntegrationByInstallationId(
        String(parsed.data.installation.id),
      );

      if (integrations === null) {
        return null;
      }

      // GitHub sends events for every repository in the installation, but the
      // member may have allowlisted only some of them. A genuine delivery from
      // an unselected repository is dropped, not rejected.
      const repositoryId = parsed.data.repository?.id;

      const matchingIntegrations = integrations.filter(
        (integration) =>
          repositoryId === undefined ||
          integration.selectedRepositoryIds.includes(repositoryId),
      );

      if (matchingIntegrations.length === 0) {
        return "ignore";
      }

      return matchingIntegrations.map((integration) => ({
        notificationEventKeys: integration.notificationEventKeys,
        workspaceId: integration.workspaceId,
      }));
    },
    translate: translateGitHubWebhookEvent,
  });
}
