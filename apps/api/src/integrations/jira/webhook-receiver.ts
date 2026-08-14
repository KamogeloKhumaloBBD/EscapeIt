import { randomUUID } from "node:crypto";

import {
  appendActivityEvent,
  parseNotificationEventKey,
  parseProviderKey,
  type DatabaseClient,
  type JsonObject,
  type NotificationChannel,
  type NotificationChannelSource,
  type NotificationEventKey,
} from "@context-layer/db";
import { z } from "zod";

import { adfToTextValue } from "./content";
import type {
  NotificationCard,
  NotificationChannelAdapter,
} from "../notification-channel-adapter";
import type { WebhookReceiver } from "../../features/webhooks/webhook-receiver";
import { WebhookReceiverError } from "../../features/webhooks/webhook-receiver";
import type { CredentialEncryption } from "../../security/credential-encryption";

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

export interface JiraWebhookReceiverDependencies {
  credentialEncryption: CredentialEncryption;
  database: DatabaseClient;
  findIntegrationByToken: (token: string) => Promise<{
    notificationEventKeys: readonly NotificationEventKey[];
    workspaceId: string;
  } | null>;
  listNotificationChannels: (
    workspaceId: string,
  ) => Promise<NotificationChannel[]>;
  listNotificationChannelSources: (
    workspaceId: string,
  ) => Promise<NotificationChannelSource[]>;
  notificationChannelAdapters: ReadonlyMap<string, NotificationChannelAdapter>;
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

async function notifyChannels(
  workspaceId: string,
  card: NotificationCard,
  {
    credentialEncryption,
    listNotificationChannels,
    listNotificationChannelSources,
    notificationChannelAdapters,
  }: Pick<
    JiraWebhookReceiverDependencies,
    | "credentialEncryption"
    | "listNotificationChannels"
    | "listNotificationChannelSources"
    | "notificationChannelAdapters"
  >,
): Promise<void> {
  const [channels, sources] = await Promise.all([
    listNotificationChannels(workspaceId),
    listNotificationChannelSources(workspaceId),
  ]);
  const subscribedChannelIds = new Set(
    sources
      .filter((source) => source.provider === jiraProvider)
      .map((source) => source.channelId),
  );

  await Promise.all(
    channels
      .filter(
        (channel) =>
          channel.status === "connected" &&
          channel.credentialEnvelope !== null &&
          subscribedChannelIds.has(channel.id),
      )
      .map(async (channel) => {
        const adapter = notificationChannelAdapters.get(channel.provider);

        if (adapter === undefined || channel.credentialEnvelope === null) {
          return;
        }

        try {
          const credentials = credentialEncryption.decrypt(
            channel.credentialEnvelope,
            "notification-channel",
            channel.id,
          ) as { webhookUrl: string };

          await adapter.send(credentials, card);
        } catch {
          // A single channel's failure (bad/expired webhook, network issue)
          // should not block delivery to other channels.
        }
      }),
  );
}

export function createJiraWebhookReceiver({
  credentialEncryption,
  database,
  findIntegrationByToken,
  listNotificationChannels,
  listNotificationChannelSources,
  notificationChannelAdapters,
}: JiraWebhookReceiverDependencies): WebhookReceiver {
  return {
    async handle(token, rawBody) {
      const integration = await findIntegrationByToken(token);

      if (integration === null) {
        throw new WebhookReceiverError("invalid_token");
      }

      let json: unknown;

      try {
        json = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new WebhookReceiverError("invalid_payload");
      }

      const parsed = jiraWebhookPayloadSchema.safeParse(json);

      if (!parsed.success) {
        throw new WebhookReceiverError("invalid_payload");
      }

      const payload = parsed.data;
      const { issue, timestamp, webhookEvent } = payload;
      const externalEventId = `${issue.id}:${String(timestamp)}`;

      const existing = await database`
        select id
        from activity_events
        where "workspaceId" = ${integration.workspaceId}
          and provider = ${jiraProvider}
          and "externalEventId" = ${externalEventId}
      `;
      const alreadyRecorded = existing.length > 0;

      let eventKey: NotificationEventKey | null;
      let card: NotificationCard;
      let metadata: JsonObject;
      let projectKey: string | null;

      if (payload.webhookEvent === "comment_created") {
        eventKey = commentedEventKey;
        card = buildCommentEventCard(payload);
        projectKey = payload.issue.fields?.project?.key ?? null;
        metadata = {
          issueId: issue.id,
          issueKey: issue.key,
          projectKey,
          webhookEvent,
        };
      } else {
        const changelogItems = payload.changelog?.items ?? [];
        eventKey = classifyIssueEvent(payload.webhookEvent, changelogItems);
        card = buildIssueEventCard(payload);
        projectKey = payload.issue.fields.project.key;
        metadata = {
          changelogItems: changelogItems.map((item) => ({
            field: item.field,
            fromString: item.fromString ?? null,
            toString: item.toString ?? null,
          })),
          issueId: issue.id,
          issueKey: issue.key,
          projectKey,
          status: payload.issue.fields.status.name,
          webhookEvent,
        };
      }

      await appendActivityEvent(database, {
        category: "webhook",
        correlationId: randomUUID(),
        externalEventId,
        metadata,
        operation: "jira.webhook_received",
        provider: jiraProvider,
        status: "succeeded",
        summary: card.summary,
        workspaceId: integration.workspaceId,
      });

      const eventEnabled =
        eventKey !== null &&
        integration.notificationEventKeys.includes(eventKey);

      if (!alreadyRecorded && eventEnabled) {
        await notifyChannels(integration.workspaceId, card, {
          credentialEncryption,
          listNotificationChannels,
          listNotificationChannelSources,
          notificationChannelAdapters,
        });
      }
    },
    provider: jiraProvider,
    async verify(token) {
      const integration = await findIntegrationByToken(token);
      return integration !== null;
    },
  };
}
