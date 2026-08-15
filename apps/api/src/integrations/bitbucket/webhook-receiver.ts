import { parseNotificationEventKey, type JsonObject } from "@context-layer/db";
import { z } from "zod";

import { bitbucketProvider } from "@context-layer/integrations";
import type {
  NotificationCard,
  NotificationCardFact,
} from "../notification-channel-adapter";
import {
  createNotificationWebhookReceiver,
  resolveByWebhookToken,
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
  links: z.object({ html: z.object({ href: z.url() }).optional() }).optional(),
});

const actorSchema = z.object({ display_name: z.string().min(1) }).optional();

const linksSchema = z
  .object({ html: z.object({ href: z.url() }).optional() })
  .optional();

const pullRequestSchema = z.object({
  id: z.number().int(),
  links: linksSchema,
  title: z.string().default(""),
});

const pullRequestEventSchema = z.object({
  actor: actorSchema,
  pullrequest: pullRequestSchema,
  repository: repositorySchema,
});

const pullRequestCommentEventSchema = z.object({
  actor: actorSchema,
  comment: z.object({
    content: z.object({ raw: z.string().default("") }).optional(),
    links: linksSchema,
  }),
  pullrequest: pullRequestSchema,
  repository: repositorySchema,
});

const issueEventSchema = z.object({
  actor: actorSchema,
  issue: z.object({
    id: z.number().int(),
    links: linksSchema,
    title: z.string().default(""),
  }),
  repository: repositorySchema,
});

const pushEventSchema = z.object({
  actor: actorSchema,
  push: z.object({
    changes: z
      .array(
        z.object({
          new: z
            .object({ name: z.string().default("") })
            .nullable()
            .optional(),
          old: z
            .object({ name: z.string().default("") })
            .nullable()
            .optional(),
        }),
      )
      .default([]),
  }),
  repository: repositorySchema,
});

const pullRequestCreatedKey = parseNotificationEventKey(
  "bitbucket.pull-request-created",
);
const pullRequestMergedKey = parseNotificationEventKey(
  "bitbucket.pull-request-merged",
);
const pullRequestCommentedKey = parseNotificationEventKey(
  "bitbucket.pull-request-commented",
);
const issueCreatedKey = parseNotificationEventKey("bitbucket.issue-created");
const pushKey = parseNotificationEventKey("bitbucket.push");

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
    title: `Bitbucket · ${repositoryFullName}`,
  };
}

function actorFact(
  actor: { display_name: string } | undefined,
  title: string,
): readonly NotificationCardFact[] {
  return actor === undefined ? [] : [{ title, value: actor.display_name }];
}

function translatePullRequest(
  payload: unknown,
  externalEventId: string,
  merged: boolean,
): TranslatedWebhookEvent {
  const parsed = pullRequestEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const { actor, pullrequest: pullRequest, repository } = parsed.data;
  const reference = `#${String(pullRequest.id)}`;

  return {
    card: card(
      repository.full_name,
      `Pull request ${reference} ${merged ? "merged" : "opened"} in ${repository.full_name}`,
      [
        { title: "Pull request", value: `${reference} — ${pullRequest.title}` },
        { title: "Repository", value: repository.full_name },
        ...actorFact(actor, merged ? "Merged by" : "Opened by"),
      ],
      pullRequest.links?.html?.href,
    ),
    eventKey: merged ? pullRequestMergedKey : pullRequestCreatedKey,
    externalEventId,
    metadata: {
      merged,
      pullRequestId: pullRequest.id,
      repository: repository.full_name,
    } satisfies JsonObject,
  };
}

function translatePullRequestComment(
  payload: unknown,
  externalEventId: string,
): TranslatedWebhookEvent {
  const parsed = pullRequestCommentEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const { actor, comment, pullrequest: pullRequest, repository } = parsed.data;
  const reference = `#${String(pullRequest.id)}`;
  const text = comment.content?.raw ?? "";

  return {
    card: card(
      repository.full_name,
      `New comment on pull request ${reference} in ${repository.full_name}`,
      [
        { title: "Pull request", value: `${reference} — ${pullRequest.title}` },
        { title: "Repository", value: repository.full_name },
        ...actorFact(actor, "Author"),
        {
          title: "Comment",
          value:
            text.length === 0
              ? "(no text)"
              : truncate(text, maximumCommentCharacters),
        },
      ],
      comment.links?.html?.href ?? pullRequest.links?.html?.href,
    ),
    eventKey: pullRequestCommentedKey,
    externalEventId,
    metadata: {
      pullRequestId: pullRequest.id,
      repository: repository.full_name,
    } satisfies JsonObject,
  };
}

function translateIssue(
  payload: unknown,
  externalEventId: string,
): TranslatedWebhookEvent {
  const parsed = issueEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const { actor, issue, repository } = parsed.data;
  const reference = `#${String(issue.id)}`;

  return {
    card: card(
      repository.full_name,
      `Issue ${reference} created in ${repository.full_name}`,
      [
        { title: "Issue", value: `${reference} — ${issue.title}` },
        { title: "Repository", value: repository.full_name },
        ...actorFact(actor, "Reported by"),
      ],
      issue.links?.html?.href,
    ),
    eventKey: issueCreatedKey,
    externalEventId,
    metadata: {
      issueId: issue.id,
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

  const { actor, push, repository } = parsed.data;
  // A branch deletion arrives as a change with `new: null`; there is nothing
  // worth showing, and no branch name to report.
  const branches = push.changes.flatMap((change) => {
    const name = change.new?.name;

    return name === undefined || name.length === 0 ? [] : [name];
  });

  if (branches.length === 0) {
    return null;
  }

  return {
    card: card(
      repository.full_name,
      `Pushed to ${branches.join(", ")} in ${repository.full_name}`,
      [
        { title: "Repository", value: repository.full_name },
        { title: "Branches", value: branches.join(", ") },
        ...actorFact(actor, "Pushed by"),
      ],
      repository.links?.html?.href,
    ),
    eventKey: pushKey,
    externalEventId,
    metadata: {
      branches,
      repository: repository.full_name,
    } satisfies JsonObject,
  };
}

export function translateBitbucketWebhookEvent(
  payload: unknown,
  headers: WebhookHeaders,
): TranslatedWebhookEvent | null {
  const event = readHeader(headers, "x-event-key");
  // Bitbucket sends X-Request-UUID on every delivery and X-Hook-UUID per hook;
  // the request id is the one that changes per delivery.
  const delivery = readHeader(headers, "x-request-uuid");

  if (event === null || delivery === null) {
    throw new WebhookReceiverError("invalid_payload");
  }

  switch (event) {
    case "issue:created":
      return translateIssue(payload, delivery);
    case "pullrequest:comment_created":
      return translatePullRequestComment(payload, delivery);
    case "pullrequest:created":
      return translatePullRequest(payload, delivery, false);
    case "pullrequest:fulfilled":
      return translatePullRequest(payload, delivery, true);
    case "repo:push":
      return translatePush(payload, delivery);
    default:
      return null;
  }
}

export interface BitbucketWebhookReceiverDependencies extends NotificationWebhookReceiverDependencies {
  findIntegrationByToken: (
    token: string,
  ) => Promise<ResolvedWebhookIntegration | null>;
}

export function createBitbucketWebhookReceiver({
  findIntegrationByToken,
  ...dependencies
}: BitbucketWebhookReceiverDependencies): WebhookReceiver {
  return createNotificationWebhookReceiver({
    ...dependencies,
    provider: bitbucketProvider,
    resolve: resolveByWebhookToken(findIntegrationByToken),
    translate: translateBitbucketWebhookEvent,
  });
}
