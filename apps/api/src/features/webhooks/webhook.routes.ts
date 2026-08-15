import type { RequestHandler } from "express";

import { parseProviderKey, type ProviderKey } from "@context-layer/db";

import { HttpError } from "../../errors";
import { WebhookReceiverError, type WebhookReceiver } from "./webhook-receiver";

export interface WebhookHandlerDependencies {
  receivers: ReadonlyMap<ProviderKey, WebhookReceiver>;
}

function toHttpError(error: unknown): HttpError {
  if (error instanceof WebhookReceiverError) {
    if (error.code === "invalid_token" || error.code === "unknown_provider") {
      return new HttpError(404, "NOT_FOUND", "The webhook was not found.");
    }

    return new HttpError(400, "INVALID_REQUEST", error.message);
  }

  return new HttpError(
    500,
    "INTERNAL_SERVER_ERROR",
    "An unexpected error occurred.",
  );
}

export function createWebhookHandler({
  receivers,
}: WebhookHandlerDependencies): RequestHandler {
  return async (request, response, next) => {
    try {
      let provider: ProviderKey;

      try {
        provider = parseProviderKey(String(request.params.provider ?? ""));
      } catch {
        throw new WebhookReceiverError("unknown_provider");
      }

      const receiver = receivers.get(provider);

      if (receiver === undefined) {
        throw new WebhookReceiverError("unknown_provider");
      }

      const rawBody: unknown = request.body;

      if (!Buffer.isBuffer(rawBody)) {
        throw new WebhookReceiverError("invalid_payload");
      }

      // Absent for providers that deliver to one shared endpoint (GitHub Apps);
      // those receivers authenticate by signature instead.
      const tokenParameter = request.params.token;
      const token =
        typeof tokenParameter === "string" && tokenParameter.length > 0
          ? tokenParameter
          : null;

      await receiver.handle(rawBody, request.headers, token);
      response.status(202).json({ data: { received: true } });
    } catch (error) {
      next(toHttpError(error));
    }
  };
}
