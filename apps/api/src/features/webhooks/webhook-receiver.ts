import type { ProviderKey } from "@context-layer/db";

export type WebhookHeaders = Readonly<
  Record<string, readonly string[] | string | undefined>
>;

export interface WebhookReceiver {
  /**
   * `token` is the secret segment of the delivery URL, or null when the
   * provider delivers to a single shared endpoint. Receivers authenticate the
   * delivery themselves — by token for providers we register per integration,
   * by signature for a GitHub App's one shared webhook — because a signature
   * cannot be checked without the body.
   */
  handle(
    rawBody: Buffer,
    headers: WebhookHeaders,
    token: string | null,
  ): Promise<void>;
  provider: ProviderKey;
}

/**
 * Providers disagree on where the event type lives: Jira puts it in the body,
 * GitHub sends `X-GitHub-Event` and Bitbucket `X-Event-Key`. Node lowercases
 * incoming header names and repeats become arrays, so read them through this.
 */
export function readHeader(
  headers: WebhookHeaders,
  name: string,
): string | null {
  const value = headers[name.toLowerCase()];

  if (value === undefined) {
    return null;
  }

  const single = typeof value === "string" ? value : value[0];

  return single !== undefined && single.length > 0 ? single : null;
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
