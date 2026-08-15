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
import {
  classifyNotificationChannelFailure,
  notificationCredentialsFailure,
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
export type WebhookResolution =
  | ResolvedWebhookIntegration
  | readonly ResolvedWebhookIntegration[]
  | "ignore"
  | null;

function isWebhookIntegrationList(
  resolution: WebhookResolution,
): resolution is readonly ResolvedWebhookIntegration[] {
  return Array.isArray(resolution);
}

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
  updateNotificationChannelHealth: (input: {
    channelId: string;
    checkedAt: Date;
    lastErrorCode: string | null;
    status: "connected" | "error";
    workspaceId: string;
  }) => Promise<boolean>;
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
  parentEventId: string,
  correlationId: string,
  {
    credentialEncryption,
    database,
    listNotificationChannels,
    listNotificationChannelSources,
    notificationChannelAdapters,
    updateNotificationChannelHealth,
  }: Pick<
    NotificationWebhookReceiverDependencies,
    | "credentialEncryption"
    | "database"
    | "listNotificationChannels"
    | "listNotificationChannelSources"
    | "notificationChannelAdapters"
    | "updateNotificationChannelHealth"
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
          await Promise.allSettled([
            updateNotificationChannelHealth({
              channelId: channel.id,
              checkedAt: new Date(),
              lastErrorCode: "adapter_unavailable",
              status: "error",
              workspaceId,
            }),
            appendActivityEvent(database, {
              category: "notification",
              correlationId,
              metadata: {
                destinationProvider: channel.provider,
                failureCode: "adapter_unavailable",
              },
              operation: "notification.delivery.failed",
              parentEventId,
              provider,
              status: "failed",
              summary:
                "Notification delivery failed because the destination is not configured.",
              workspaceId,
            }),
          ]);
          return;
        }

        let failure: ReturnType<
          typeof classifyNotificationChannelFailure
        > | null = null;

        let credentials: { webhookUrl: string } | null = null;
        try {
          credentials = credentialEncryption.decrypt(
            channel.credentialEnvelope,
            "notification-channel",
            channel.id,
          ) as { webhookUrl: string };
        } catch {
          failure = notificationCredentialsFailure();
        }

        if (credentials !== null) {
          try {
            await adapter.send(credentials, card);
          } catch (error) {
            failure = classifyNotificationChannelFailure(error);
          }
        }

        if (failure === null) {
          await updateNotificationChannelHealth({
            channelId: channel.id,
            checkedAt: new Date(),
            lastErrorCode: null,
            status: "connected",
            workspaceId,
          }).catch(() => undefined);
          return;
        }

        // Health persistence and diagnostics are best effort so one broken
        // destination never prevents delivery to the remaining channels.
        await Promise.allSettled([
          updateNotificationChannelHealth({
            channelId: channel.id,
            checkedAt: new Date(),
            lastErrorCode: failure.code,
            status: failure.permanent ? "error" : "connected",
            workspaceId,
          }),
          appendActivityEvent(database, {
            category: "notification",
            correlationId,
            metadata: {
              destinationProvider: channel.provider,
              failureCode: failure.code,
            },
            operation: "notification.delivery.failed",
            parentEventId,
            provider,
            status: "failed",
            summary: failure.publicMessage,
            workspaceId,
          }),
        ]);
      }),
  );
}

export function createNotificationWebhookReceiver({
  credentialEncryption,
  database,
  listNotificationChannels,
  listNotificationChannelSources,
  notificationChannelAdapters,
  updateNotificationChannelHealth,
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

      const integrations: readonly ResolvedWebhookIntegration[] =
        isWebhookIntegrationList(resolution) ? resolution : [resolution];

      if (integrations.length === 0) {
        return;
      }

      const translated = translate(payload, headers);

      if (translated === null) {
        return;
      }

      const { card, eventKey, externalEventId, metadata } = translated;

      await Promise.all(
        integrations.map(async (integration) => {
          const existing = await database`
            select id
            from activity_events
            where "workspaceId" = ${integration.workspaceId}
              and provider = ${provider}
              and "externalEventId" = ${externalEventId}
          `;
          const alreadyRecorded = existing.length > 0;

          const activity = await appendActivityEvent(database, {
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
            await notifyChannels(
              provider,
              integration.workspaceId,
              card,
              activity.id,
              activity.correlationId,
              {
                credentialEncryption,
                database,
                listNotificationChannels,
                listNotificationChannelSources,
                notificationChannelAdapters,
                updateNotificationChannelHealth,
              },
            );
          }
        }),
      );
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
