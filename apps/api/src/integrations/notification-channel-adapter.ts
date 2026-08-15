import type { ProviderKey } from "@context-layer/db";

export interface TeamsChannelCredentials {
  webhookUrl: string;
}

export interface NotificationCardFact {
  title: string;
  value: string;
}

export interface NotificationCard {
  actionUrl?: string;
  facts?: readonly NotificationCardFact[];
  summary: string;
  title: string;
}

export interface NotificationChannelAdapter {
  provider: ProviderKey;
  send(
    credentials: TeamsChannelCredentials,
    card: NotificationCard,
  ): Promise<void>;
  validateConfiguration(webhookUrl: string): void;
}

export class NotificationChannelAdapterError extends Error {
  readonly code:
    "invalid_response" | "invalid_webhook_url" | "temporarily_unavailable";

  constructor(
    code: NotificationChannelAdapterError["code"],
    message = "The notification channel request could not be completed.",
  ) {
    super(message);
    this.name = "NotificationChannelAdapterError";
    this.code = code;
  }
}

export interface NotificationChannelFailure {
  code:
    | "credentials_unavailable"
    | "invalid_response"
    | "invalid_webhook_url"
    | "temporarily_unavailable";
  permanent: boolean;
  publicCode: string;
  publicMessage: string;
}

export function notificationCredentialsFailure(): NotificationChannelFailure {
  return {
    code: "credentials_unavailable",
    permanent: true,
    publicCode: "NOTIFICATION_CREDENTIALS_UNAVAILABLE",
    publicMessage:
      "The stored webhook credentials can no longer be read. Replace the webhook URL and test the channel again.",
  };
}

export function classifyNotificationChannelFailure(
  error: unknown,
): NotificationChannelFailure {
  if (error instanceof NotificationChannelAdapterError) {
    if (error.code === "invalid_webhook_url") {
      return {
        code: error.code,
        permanent: true,
        publicCode: "NOTIFICATION_WEBHOOK_INVALID",
        publicMessage:
          "The notification webhook URL is invalid. Replace it with a valid HTTPS URL and test the channel again.",
      };
    }

    if (error.code === "invalid_response") {
      return {
        code: error.code,
        permanent: true,
        publicCode: "NOTIFICATION_CHANNEL_REJECTED",
        publicMessage:
          "The notification service rejected this webhook. Replace or reauthorize the webhook, then test the channel again.",
      };
    }
  }

  return {
    code: "temporarily_unavailable",
    permanent: false,
    publicCode: "NOTIFICATION_CHANNEL_UNAVAILABLE",
    publicMessage:
      "The notification service could not be reached. Wait a few minutes, then test the channel again.",
  };
}
