import {
  parseNotificationEventKey,
  parseProviderKey,
  type JsonObject,
  type NotificationEventKey,
} from "@context-layer/db";
import { z } from "zod";

import { adfToTextValue } from "@context-layer/integrations";
import type { NotificationCard } from "../notification-channel-adapter";
import {
  createNotificationWebhookReceiver,
  resolveByWebhookToken,
  type NotificationWebhookReceiverDependencies,
  type ResolvedWebhookIntegration,
  type TranslatedWebhookEvent,
} from "../../features/webhooks/notification-receiver";
import type { WebhookReceiver } from "../../features/webhooks/webhook-receiver";
import { WebhookReceiverError } from "../../features/webhooks/webhook-receiver";

const maximumCommentCharacters = 400;

const changelogItemSchema = z.object({
  field: z.string().min(1),
  fromString: z.string().nullable().optional(),
  toString: z.string().nullable().optional(),
});

// jira:issue_updated / jira:issue_created carry a full issue payload with a
// documented, stable shape. changelog is present only on issue_updated.
const issueEventPayloadSchema = z.object({
  changelog: z
    .object({ items: z.array(changelogItemSchema).default([]) })
    .optional(),
  issue: z.object({
    fields: z.object({
      project: z.object({ key: z.string().min(1) }),
      status: z.object({ name: z.string().min(1) }),
      summary: z.string().min(1),
      updated: z.string().min(1),
    }),
    id: z.string().min(1),
    key: z.string().min(1),
    self: z.url().optional(),
  }),
  timestamp: z.number(),
  webhookEvent: z.enum(["jira:issue_updated", "jira:issue_created"]),
});

// comment_created's payload shape is not documented with a worked example by
// Atlassian, so this stays deliberately loose: only fields we've confirmed
// are required (via the {issue.key}/{comment.id} JQL context params Atlassian
// documents) are required; everything used for display is optional with a
// fallback so an unexpected shape doesn't drop the whole event.
const commentEventPayloadSchema = z.object({
  comment: z
    .object({
      body: z.unknown().optional(),
    })
    .optional(),
  issue: z.object({
    fields: z
      .object({
        project: z.object({ key: z.string().min(1) }).optional(),
        status: z.object({ name: z.string().min(1) }).optional(),
        summary: z.string().optional(),
      })
      .optional(),
    id: z.string().min(1),
    key: z.string().min(1),
    self: z.url().optional(),
  }),
  timestamp: z.number(),
  webhookEvent: z.literal("comment_created"),
});

const jiraWebhookPayloadSchema = z.union([
  issueEventPayloadSchema,
  commentEventPayloadSchema,
]);

export const jiraProvider = parseProviderKey("jira");

export interface JiraWebhookReceiverDependencies extends NotificationWebhookReceiverDependencies {
  findIntegrationByToken: (
    token: string,
  ) => Promise<ResolvedWebhookIntegration | null>;
}

const assignedEventKey = parseNotificationEventKey("jira.issue-assigned");
const statusChangedEventKey = parseNotificationEventKey(
  "jira.issue-status-changed",
);
const commentedEventKey = parseNotificationEventKey("jira.issue-commented");
const createdEventKey = parseNotificationEventKey("jira.issue-created");
const priorityChangedEventKey = parseNotificationEventKey(
  "jira.issue-priority-changed",
);

function statusChangeOf(
  changelogItems: readonly z.infer<typeof changelogItemSchema>[],
) {
  return changelogItems.find((item) => item.field === "status");
}

function classifyIssueEvent(
  webhookEvent: "jira:issue_created" | "jira:issue_updated",
  changelogItems: readonly z.infer<typeof changelogItemSchema>[],
): NotificationEventKey | null {
  if (webhookEvent === "jira:issue_created") {
    return createdEventKey;
  }
  if (changelogItems.some((item) => item.field === "assignee")) {
    return assignedEventKey;
  }
  if (changelogItems.some((item) => item.field === "status")) {
    return statusChangedEventKey;
  }
  if (changelogItems.some((item) => item.field === "priority")) {
    return priorityChangedEventKey;
  }
  return null;
}

function browseUrlFor(issueKey: string, issueSelf: string | undefined) {
  return issueSelf === undefined
    ? undefined
    : new URL(`/browse/${issueKey}`, issueSelf).toString();
}

function buildIssueEventCard(
  payload: z.infer<typeof issueEventPayloadSchema>,
): NotificationCard {
  const { issue } = payload;
  const changelogItems = payload.changelog?.items ?? [];
  const statusChange = statusChangeOf(changelogItems);
  const summary =
    payload.webhookEvent === "jira:issue_created"
      ? `Jira issue ${issue.key} created`
      : statusChange === undefined
        ? `Jira issue ${issue.key} updated`
        : `Jira issue ${issue.key} moved from ${statusChange.fromString ?? "?"} to ${statusChange.toString ?? "?"}`;
  const browseUrl = browseUrlFor(issue.key, issue.self);

  return {
    ...(browseUrl === undefined ? {} : { actionUrl: browseUrl }),
    facts: [
      { title: "Issue", value: `${issue.key} — ${issue.fields.summary}` },
      { title: "Project", value: issue.fields.project.key },
      { title: "Status", value: issue.fields.status.name },
      ...(statusChange === undefined
        ? []
        : [{ title: "Changed from", value: statusChange.fromString ?? "—" }]),
    ],
    summary,
    title: `Jira · ${issue.key}`,
  };
}

function buildCommentEventCard(
  payload: z.infer<typeof commentEventPayloadSchema>,
): NotificationCard {
  const { issue } = payload;
  const commentText = adfToTextValue(
    payload.comment?.body,
    maximumCommentCharacters,
  ).text;
  const browseUrl = browseUrlFor(issue.key, issue.self);

  return {
    ...(browseUrl === undefined ? {} : { actionUrl: browseUrl }),
    facts: [
      {
        title: "Issue",
        value:
          issue.fields?.summary === undefined
            ? issue.key
            : `${issue.key} — ${issue.fields.summary}`,
      },
      ...(issue.fields?.project?.key === undefined
        ? []
        : [{ title: "Project", value: issue.fields.project.key }]),
      { title: "Comment", value: commentText ?? "(no text)" },
    ],
    summary: `New comment on Jira issue ${issue.key}`,
    title: `Jira · ${issue.key}`,
  };
}
export function translateJiraWebhookEvent(
  payload: unknown,
): TranslatedWebhookEvent {
  const parsed = jiraWebhookPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const event = parsed.data;
  const { issue, timestamp, webhookEvent } = event;
  const externalEventId = `${issue.id}:${String(timestamp)}`;

  if (event.webhookEvent === "comment_created") {
    const projectKey = event.issue.fields?.project?.key ?? null;

    return {
      card: buildCommentEventCard(event),
      eventKey: commentedEventKey,
      externalEventId,
      metadata: {
        issueId: issue.id,
        issueKey: issue.key,
        projectKey,
        webhookEvent,
      } satisfies JsonObject,
    };
  }

  const changelogItems = event.changelog?.items ?? [];

  return {
    card: buildIssueEventCard(event),
    eventKey: classifyIssueEvent(event.webhookEvent, changelogItems),
    externalEventId,
    metadata: {
      changelogItems: changelogItems.map((item) => ({
        field: item.field,
        fromString: item.fromString ?? null,
        toString: item.toString ?? null,
      })),
      issueId: issue.id,
      issueKey: issue.key,
      projectKey: event.issue.fields.project.key,
      status: event.issue.fields.status.name,
      webhookEvent,
    } satisfies JsonObject,
  };
}

export function createJiraWebhookReceiver({
  findIntegrationByToken,
  ...dependencies
}: JiraWebhookReceiverDependencies): WebhookReceiver {
  return createNotificationWebhookReceiver({
    ...dependencies,
    provider: jiraProvider,
    resolve: resolveByWebhookToken(findIntegrationByToken),
    translate: (payload) => translateJiraWebhookEvent(payload),
  });
}
