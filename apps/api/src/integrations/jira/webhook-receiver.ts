import { randomUUID } from "node:crypto";

import {
  appendActivityEvent,
  parseProviderKey,
  type DatabaseClient,
  type NotificationChannel,
  type NotificationChannelSource,
} from "@context-layer/db";
import { z } from "zod";

import type {
  NotificationCard,
  NotificationChannelAdapter,
} from "../notification-channel-adapter";
import type { WebhookReceiver } from "../../features/webhooks/webhook-receiver";
import { WebhookReceiverError } from "../../features/webhooks/webhook-receiver";
import type { CredentialEncryption } from "../../security/credential-encryption";

const changelogItemSchema = z.object({
  field: z.string().min(1),
  fromString: z.string().nullable().optional(),
  toString: z.string().nullable().optional(),
});

const jiraWebhookPayloadSchema = z.object({
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
  webhookEvent: z.string().min(1),
});

export const jiraProvider = parseProviderKey("jira");

export interface JiraWebhookReceiverDependencies {
  credentialEncryption: CredentialEncryption;
  database: DatabaseClient;
  findIntegrationByToken: (
    token: string,
  ) => Promise<{ notificationsEnabled: boolean; workspaceId: string } | null>;
  listNotificationChannels: (
    workspaceId: string,
  ) => Promise<NotificationChannel[]>;
  listNotificationChannelSources: (
    workspaceId: string,
  ) => Promise<NotificationChannelSource[]>;
  notificationChannelAdapters: ReadonlyMap<string, NotificationChannelAdapter>;
}

function statusChangeOf(
  changelogItems: readonly z.infer<typeof changelogItemSchema>[],
) {
  return changelogItems.find((item) => item.field === "status");
}

function summarize(
  issueKey: string,
  changelogItems: readonly z.infer<typeof changelogItemSchema>[],
): string {
  const statusChange = statusChangeOf(changelogItems);

  if (statusChange !== undefined) {
    return `Jira issue ${issueKey} moved from ${statusChange.fromString ?? "?"} to ${statusChange.toString ?? "?"}`;
  }

  return `Jira issue ${issueKey} updated`;
}

function buildCard(
  issue: z.infer<typeof jiraWebhookPayloadSchema>["issue"],
  changelogItems: readonly z.infer<typeof changelogItemSchema>[],
): NotificationCard {
  const statusChange = statusChangeOf(changelogItems);
  const browseUrl =
    issue.self === undefined
      ? undefined
      : new URL(`/browse/${issue.key}`, issue.self).toString();

  return {
    ...(browseUrl === undefined ? {} : { actionUrl: browseUrl }),
    facts: [
      { title: "Issue", value: `${issue.key} — ${issue.fields.summary}` },
      { title: "Project", value: issue.fields.project.key },
      { title: "Status", value: issue.fields.status.name },
      ...(statusChange === undefined
        ? []
        : [
            {
              title: "Changed from",
              value: statusChange.fromString ?? "—",
            },
          ]),
    ],
    summary: summarize(issue.key, changelogItems),
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

      const { issue, changelog, timestamp, webhookEvent } = parsed.data;
      const changelogItems = changelog?.items ?? [];
      const externalEventId = `${issue.id}:${String(timestamp)}`;

      const existing = await database`
        select id
        from activity_events
        where "workspaceId" = ${integration.workspaceId}
          and provider = ${jiraProvider}
          and "externalEventId" = ${externalEventId}
      `;
      const alreadyRecorded = existing.length > 0;
      const summary = summarize(issue.key, changelogItems);

      await appendActivityEvent(database, {
        category: "webhook",
        correlationId: randomUUID(),
        externalEventId,
        metadata: {
          changelogItems: changelogItems.map((item) => ({
            field: item.field,
            fromString: item.fromString ?? null,
            toString: item.toString ?? null,
          })),
          issueId: issue.id,
          issueKey: issue.key,
          projectKey: issue.fields.project.key,
          status: issue.fields.status.name,
          webhookEvent,
        },
        operation: "jira.webhook_received",
        provider: jiraProvider,
        status: "succeeded",
        summary,
        workspaceId: integration.workspaceId,
      });

      if (!alreadyRecorded && integration.notificationsEnabled) {
        await notifyChannels(
          integration.workspaceId,
          buildCard(issue, changelogItems),
          {
            credentialEncryption,
            listNotificationChannels,
            listNotificationChannelSources,
            notificationChannelAdapters,
          },
        );
      }
    },
    provider: jiraProvider,
    async verify(token) {
      const integration = await findIntegrationByToken(token);
      return integration !== null;
    },
  };
}
