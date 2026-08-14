import type { ProviderKey } from "@context-layer/db";

export interface WebhookReceiver {
  handle(token: string, rawBody: Buffer): Promise<void>;
  provider: ProviderKey;
  verify(token: string): Promise<boolean>;
}

export class WebhookReceiverError extends Error {
  readonly code: "invalid_payload" | "invalid_token" | "unknown_provider";

  constructor(
    code: WebhookReceiverError["code"],
    message = "The webhook request could not be processed.",
  ) {
    super(message);
    this.name = "WebhookReceiverError";
    this.code = code;
  }
}
