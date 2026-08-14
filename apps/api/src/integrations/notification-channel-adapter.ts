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
