import { randomUUID } from "node:crypto";

import {
  appendActivityEvent,
  parseProviderKey,
  type DatabaseClient,
  type NotificationChannel,
} from "@context-layer/db";
import { z } from "zod";

import type { WebhookReceiver } from "../../features/webhooks/webhook-receiver";
import { WebhookReceiverError } from "../../features/webhooks/webhook-receiver";
import type { NotificationChannelAdapter } from "../notification-channel-adapter";
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
  ) => Promise<{ workspaceId: string } | null>;
  listNotificationChannels: (
    workspaceId: string,
  ) => Promise<NotificationChannel[]>;
  notificationChannelAdapters: ReadonlyMap<string, NotificationChannelAdapter>;
}

function summarize(
  issueKey: string,
  changelogItems: readonly z.infer<typeof changelogItemSchema>[],
): string {
  const statusChange = changelogItems.find((item) => item.field === "status");

  if (statusChange !== undefined) {
    return `Jira issue ${issueKey} moved from ${statusChange.fromString ?? "?"} to ${statusChange.toString ?? "?"}`;
  }

  return `Jira issue ${issueKey} updated`;
}

async function notifyChannels(
  workspaceId: string,
  card: { summary: string; title: string },
  {
    credentialEncryption,
    listNotificationChannels,
    notificationChannelAdapters,
  }: Pick<
    JiraWebhookReceiverDependencies,
    | "credentialEncryption"
    | "listNotificationChannels"
    | "notificationChannelAdapters"
  >,
): Promise<void> {
  const channels = await listNotificationChannels(workspaceId);

  await Promise.all(
    channels
      .filter(
        (channel) =>
          channel.status === "connected" && channel.credentialEnvelope !== null,
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

      if (!alreadyRecorded) {
        await notifyChannels(
          integration.workspaceId,
          {
            summary,
            title: `Jira · ${issue.fields.project.key}`,
          },
          {
            credentialEncryption,
            listNotificationChannels,
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
