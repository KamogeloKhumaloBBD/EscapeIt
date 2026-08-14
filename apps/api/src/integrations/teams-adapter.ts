import { parseProviderKey } from "@context-layer/db";

import {
  NotificationChannelAdapterError,
  type NotificationCard,
  type NotificationChannelAdapter,
  type TeamsChannelCredentials,
} from "./notification-channel-adapter";

const teamsProviderKey = parseProviderKey("teams");
const requestTimeoutMs = 10_000;

function buildAdaptiveCardPayload(card: NotificationCard): unknown {
  const body: unknown[] = [
    {
      text: card.title,
      type: "TextBlock",
      weight: "Bolder",
      size: "Medium",
      wrap: true,
    },
    {
      text: card.summary,
      type: "TextBlock",
      wrap: true,
    },
  ];

  if (card.facts !== undefined && card.facts.length > 0) {
    body.push({
      facts: card.facts.map((fact) => ({
        title: fact.title,
        value: fact.value,
      })),
      type: "FactSet",
    });
  }

  return {
    attachments: [
      {
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          actions:
            card.actionUrl === undefined
              ? undefined
              : [
                  {
                    title: "Open",
                    type: "Action.OpenUrl",
                    url: card.actionUrl,
                  },
                ],
          body,
          type: "AdaptiveCard",
          version: "1.4",
        },
        contentType: "application/vnd.microsoft.card.adaptive",
      },
    ],
    type: "message",
  };
}

export function createTeamsAdapter(): NotificationChannelAdapter {
  return {
    provider: teamsProviderKey,

    validateConfiguration(webhookUrl) {
      let parsed: URL;

      try {
        parsed = new URL(webhookUrl);
      } catch {
        throw new NotificationChannelAdapterError(
          "invalid_webhook_url",
          "The webhook URL is not a valid URL.",
        );
      }

      if (parsed.protocol !== "https:") {
        throw new NotificationChannelAdapterError(
          "invalid_webhook_url",
          "The webhook URL must use HTTPS.",
        );
      }
    },

    async send(credentials: TeamsChannelCredentials, card: NotificationCard) {
      let response: Response;

      try {
        response = await fetch(credentials.webhookUrl, {
          body: JSON.stringify(buildAdaptiveCardPayload(card)),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
      } catch {
        throw new NotificationChannelAdapterError(
          "temporarily_unavailable",
          "Microsoft Teams could not be reached.",
        );
      }

      if (!response.ok) {
        throw new NotificationChannelAdapterError(
          "invalid_response",
          `Microsoft Teams rejected the notification (status ${String(response.status)}).`,
        );
      }
    },
  };
}
