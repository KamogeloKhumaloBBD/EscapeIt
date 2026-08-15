import { parseNotificationEventKey, type JsonObject } from "@context-layer/db";
import { z } from "zod";

import { confluenceProvider } from "./definition";
import { cloudIdFromInvocationToken } from "./forge-invocation-token";
import type {
  NotificationCard,
  NotificationCardFact,
} from "../notification-channel-adapter";
import {
  createNotificationWebhookReceiver,
  type NotificationWebhookReceiverDependencies,
  type ResolvedWebhookIntegration,
  type TranslatedWebhookEvent,
} from "../../features/webhooks/notification-receiver";
import {
  readHeader,
  WebhookReceiverError,
  type WebhookReceiver,
} from "../../features/webhooks/webhook-receiver";

// Confluence nests the page (or blogpost) under `content`, with the space and
// version alongside it. Shapes below are taken from real deliveries rather
// than documentation, which describes the events but not their bodies.
const contentSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  space: z
    .object({
      id: z.union([z.string(), z.number()]).transform(String).optional(),
      key: z.string().min(1).optional(),
    })
    .optional(),
  title: z.string().default(""),
  type: z.string().optional(),
  version: z
    .object({ number: z.number().int().nonnegative().optional() })
    .optional(),
});

const pageEventSchema = z.object({
  content: contentSchema,
  eventType: z.string().min(1),
  updateTrigger: z.string().optional(),
});

// Comment events also use `content`; their page lives under `container`.
const commentEventSchema = z.object({
  content: contentSchema.extend({
    container: z
      .object({
        id: z.union([z.string(), z.number()]).transform(String),
        title: z.string().default(""),
      })
      .optional(),
  }),
  eventCreatedDate: z.string().optional(),
  eventType: z.string().min(1),
});

const pageCreatedKey = parseNotificationEventKey("confluence.page-created");
const pageUpdatedKey = parseNotificationEventKey("confluence.page-updated");
const commentCreatedKey = parseNotificationEventKey(
  "confluence.comment-created",
);

function card(
  spaceKey: string,
  summary: string,
  facts: readonly NotificationCardFact[],
): NotificationCard {
  return {
    facts,
    summary,
    title: `Confluence · ${spaceKey}`,
  };
}

function spaceIdOf(payload: unknown): string | null {
  const parsed = z
    .object({
      content: z
        .object({
          space: z
            .object({
              id: z
                .union([z.string(), z.number()])
                .transform(String)
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .safeParse(payload);

  return parsed.success ? (parsed.data.content?.space?.id ?? null) : null;
}

function translatePage(payload: unknown): TranslatedWebhookEvent {
  const parsed = pageEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const event = parsed.data;
  const created = event.eventType.includes("created");
  const version = event.content.version?.number;
  const spaceKey = event.content.space?.key ?? "—";
  const label = event.content.type === "blogpost" ? "Blog post" : "Page";

  return {
    card: card(
      spaceKey,
      `${event.content.title} ${created ? "created" : "updated"} in ${spaceKey}`,
      [
        { title: label, value: event.content.title },
        { title: "Space", value: spaceKey },
        ...(version === undefined
          ? []
          : [{ title: "Version", value: String(version) }]),
      ],
    ),
    eventKey: created ? pageCreatedKey : pageUpdatedKey,
    // A page id repeats on every edit, so the version distinguishes them.
    // Without one, a redelivery of the same edit would be indistinguishable.
    externalEventId: `${event.content.id}:${String(version ?? "0")}`,
    metadata: {
      eventType: event.eventType,
      pageId: event.content.id,
      spaceKey,
      // Kept so a digest can link to the page using the name it calls it by.
      title: event.content.title,
      updateTrigger: event.updateTrigger ?? null,
      version: version ?? null,
    } satisfies JsonObject,
  };
}

function translateComment(payload: unknown): TranslatedWebhookEvent {
  const parsed = commentEventSchema.safeParse(payload);

  if (!parsed.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const event = parsed.data;
  const spaceKey = event.content.space?.key ?? "—";
  const containerTitle = event.content.container?.title ?? event.content.title;
  const title = containerTitle.length > 0 ? containerTitle : "a page";
  const commentId = event.content.id;

  return {
    card: card(spaceKey, `New comment on ${title} in ${spaceKey}`, [
      { title: "Page", value: title },
      { title: "Space", value: spaceKey },
    ]),
    eventKey: commentCreatedKey,
    externalEventId: `comment:${commentId}`,
    metadata: {
      commentId,
      eventType: event.eventType,
      pageId: event.content.container?.id ?? null,
      spaceKey,
    } satisfies JsonObject,
  };
}

export function translateConfluenceWebhookEvent(
  payload: unknown,
): TranslatedWebhookEvent | null {
  const eventType = z
    .object({ eventType: z.string().min(1) })
    .safeParse(payload);

  if (!eventType.success) {
    throw new WebhookReceiverError("invalid_payload");
  }

  const type = eventType.data.eventType;

  if (type.includes("comment")) {
    return translateComment(payload);
  }

  if (type.includes("page")) {
    return translatePage(payload);
  }

  // Forge delivers whatever the manifest subscribes to; anything we do not
  // model is acknowledged and dropped.
  return null;
}

export interface ConfluenceWebhookReceiverDependencies extends NotificationWebhookReceiverDependencies {
  /**
   * Resolves every workspace connected to a Confluence site (cloud) id, along
   * with the stable space ids each owner allowlisted.
   */
  findIntegrationByCloudId: (cloudId: string) => Promise<
    | readonly (ResolvedWebhookIntegration & {
        selectedSpaceIds: readonly string[];
      })[]
    | null
  >;
  /**
   * The Forge app id, which is the audience of every invocation token. Null
   * disables Confluence notifications rather than trusting unsigned requests.
   */
  forgeAppId: string | null;
}

export function createConfluenceWebhookReceiver({
  findIntegrationByCloudId,
  forgeAppId,
  ...dependencies
}: ConfluenceWebhookReceiverDependencies): WebhookReceiver {
  return createNotificationWebhookReceiver({
    ...dependencies,
    provider: confluenceProvider,
    async resolve({ headers, payload }) {
      if (forgeAppId === null) {
        return null;
      }

      const cloudId = await cloudIdFromInvocationToken(
        readHeader(headers, "authorization"),
        forgeAppId,
      );

      if (cloudId === null) {
        return null;
      }

      const integrations = await findIntegrationByCloudId(cloudId);

      if (integrations === null) {
        return null;
      }

      // Forge sends events for every space on the site, but the owner may
      // have allowlisted only some. A genuine event from an unselected space
      // is dropped rather than rejected.
      const spaceId = spaceIdOf(payload);

      const matchingIntegrations = integrations.filter(
        (integration) =>
          spaceId === null || integration.selectedSpaceIds.includes(spaceId),
      );

      if (matchingIntegrations.length === 0) {
        return "ignore";
      }

      return matchingIntegrations.map((integration) => ({
        notificationEventKeys: integration.notificationEventKeys,
        workspaceId: integration.workspaceId,
      }));
    },
    translate: (payload) => translateConfluenceWebhookEvent(payload),
  });
}
