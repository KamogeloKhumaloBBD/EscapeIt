import { randomUUID } from "node:crypto";

import {
  appendActivityEvent,
  type DatabaseClient,
  type JsonObject,
  type NotificationChannel,
  type NotificationChannelSource,
  type NotificationEventKey,
  type ProviderKey,
} from "@context-layer/db";

import type {
  NotificationCard,
  NotificationChannelAdapter,
} from "../../integrations/notification-channel-adapter";
import type { CredentialEncryption } from "../../security/credential-encryption";
import {
  WebhookReceiverError,
  type WebhookHeaders,
  type WebhookReceiver,
} from "./webhook-receiver";

/**
 * What a provider derives from one webhook delivery. `eventKey` is null when
 * the payload is understood but carries nothing worth notifying about (a Jira
 * update touching no tracked field, a GitHub action we do not subscribe to) —
 * the delivery is still recorded as activity, it just sends no card.
 */
export interface TranslatedWebhookEvent {
  card: NotificationCard;
  eventKey: NotificationEventKey | null;
  externalEventId: string;
  metadata: JsonObject;
}

export interface ResolvedWebhookIntegration {
  notificationEventKeys: readonly NotificationEventKey[];
  workspaceId: string;
}

/**
 * `null` rejects the delivery as unauthenticated (404). `"ignore"` accepts it
 * as genuine but uninteresting — a repository the member did not allowlist —
 * and answers 202 so the provider does not treat it as a failed delivery and
 * disable the webhook.
 */
export type WebhookResolution = ResolvedWebhookIntegration | "ignore" | null;

export interface WebhookResolutionInput {
  headers: WebhookHeaders;
  payload: unknown;
  rawBody: Buffer;
  token: string | null;
}

export interface NotificationWebhookReceiverDependencies {
  credentialEncryption: CredentialEncryption;
  database: DatabaseClient;
  listNotificationChannels: (
    workspaceId: string,
  ) => Promise<NotificationChannel[]>;
  listNotificationChannelSources: (
    workspaceId: string,
  ) => Promise<NotificationChannelSource[]>;
  notificationChannelAdapters: ReadonlyMap<string, NotificationChannelAdapter>;
}

export interface NotificationWebhookReceiverOptions extends NotificationWebhookReceiverDependencies {
  provider: ProviderKey;
  /**
   * Authenticates the delivery and finds whose it is. Returning null rejects
   * it as unauthenticated. Providers registered per integration match on the
   * URL token; a GitHub App checks the signature and reads the installation
   * id out of the payload, which is why this runs after parsing.
   */
  resolve: (input: WebhookResolutionInput) => Promise<WebhookResolution>;
  /**
   * Throw WebhookReceiverError("invalid_payload") for a payload that does not
   * match the provider's contract; return null for one that is valid but
   * carries no event we model, which is answered with 202 and dropped.
   */
  translate: (
    payload: unknown,
    headers: WebhookHeaders,
  ) => TranslatedWebhookEvent | null;
}

async function notifyChannels(
  provider: ProviderKey,
  workspaceId: string,
  card: NotificationCard,
  {
    credentialEncryption,
    listNotificationChannels,
    listNotificationChannelSources,
    notificationChannelAdapters,
  }: Pick<
    NotificationWebhookReceiverDependencies,
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
      .filter((source) => source.provider === provider)
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

export function createNotificationWebhookReceiver({
  credentialEncryption,
  database,
  listNotificationChannels,
  listNotificationChannelSources,
  notificationChannelAdapters,
  provider,
  resolve,
  translate,
}: NotificationWebhookReceiverOptions): WebhookReceiver {
  return {
    async handle(rawBody, headers, token) {
      let payload: unknown;

      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new WebhookReceiverError("invalid_payload");
      }

      const resolution = await resolve({ headers, payload, rawBody, token });

      if (resolution === "ignore") {
        return;
      }

      if (resolution === null) {
        throw new WebhookReceiverError("invalid_token");
      }

      const integration = resolution;

      const translated = translate(payload, headers);

      if (translated === null) {
        return;
      }

      const { card, eventKey, externalEventId, metadata } = translated;

      const existing = await database`
        select id
        from activity_events
        where "workspaceId" = ${integration.workspaceId}
          and provider = ${provider}
          and "externalEventId" = ${externalEventId}
      `;
      const alreadyRecorded = existing.length > 0;

      await appendActivityEvent(database, {
        category: "webhook",
        correlationId: randomUUID(),
        externalEventId,
        metadata,
        operation: `${provider}.webhook_received`,
        provider,
        status: "succeeded",
        summary: card.summary,
        workspaceId: integration.workspaceId,
      });

      const eventEnabled =
        eventKey !== null &&
        integration.notificationEventKeys.includes(eventKey);

      if (!alreadyRecorded && eventEnabled) {
        await notifyChannels(provider, integration.workspaceId, card, {
          credentialEncryption,
          listNotificationChannels,
          listNotificationChannelSources,
          notificationChannelAdapters,
        });
      }
    },
    provider,
  };
}

/**
 * Resolution for providers whose webhook we register per integration, where
 * the secret token in the delivery URL both authenticates and identifies.
 */
export function resolveByWebhookToken(
  findIntegrationByToken: (
    token: string,
  ) => Promise<ResolvedWebhookIntegration | null>,
): NotificationWebhookReceiverOptions["resolve"] {
  return async ({ token }) =>
    token === null ? null : findIntegrationByToken(token);
}
