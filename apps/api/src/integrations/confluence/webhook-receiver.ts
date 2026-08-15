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

const maximumExcerptCharacters = 400;

// Confluence nests the page (or blogpost) under `content`, with the space and
// version alongside it. Shapes below are taken from real deliveries rather
// than documentation, which describes the events but not their bodies.
const contentSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  space: z.object({ key: z.string().min(1).optional() }).optional(),
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

// Comment deliveries have not been observed yet, so everything except the
// event type is optional: a shape we did not anticipate should degrade to a
// thinner card rather than rejecting the delivery outright.
const commentEventSchema = z.object({
  comment: z
    .object({
      body: z.unknown().optional(),
      id: z.union([z.string(), z.number()]).transform(String).optional(),
    })
    .optional(),
  content: contentSchema.optional(),
  eventCreatedDate: z.string().optional(),
  eventType: z.string().min(1),
});

const pageCreatedKey = parseNotificationEventKey("confluence.page-created");
const pageUpdatedKey = parseNotificationEventKey("confluence.page-updated");
const commentCreatedKey = parseNotificationEventKey(
  "confluence.comment-created",
);

function truncate(value: string, limit: number): string {
  const collapsed = value.replaceAll(/\s+/gu, " ").trim();

  return collapsed.length <= limit
    ? collapsed
    : `${collapsed.slice(0, limit - 1)}…`;
}

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

function spaceKeyOf(payload: unknown): string | null {
  const parsed = z
    .object({
      content: z
        .object({
          space: z.object({ key: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .safeParse(payload);

  return parsed.success ? (parsed.data.content?.space?.key ?? null) : null;
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
  const spaceKey = event.content?.space?.key ?? "—";
  const title = event.content?.title ?? "a page";
  const body =
    typeof event.comment?.body === "string" ? event.comment.body : "";
  // Falls back to the delivery timestamp when no comment id is present, so an
  // unexpected shape still dedupes rather than replaying on every retry.
  const commentId = event.comment?.id ?? event.eventCreatedDate ?? title;

  return {
    card: card(spaceKey, `New comment on ${title} in ${spaceKey}`, [
      { title: "Page", value: title },
      { title: "Space", value: spaceKey },
      ...(body.length === 0
        ? []
        : [
            {
              title: "Comment",
              value: truncate(body, maximumExcerptCharacters),
            },
          ]),
    ]),
    eventKey: commentCreatedKey,
    externalEventId: `comment:${commentId}`,
    metadata: {
      commentId: event.comment?.id ?? null,
      eventType: event.eventType,
      pageId: event.content?.id ?? null,
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
   * Resolves the workspace from a Confluence site (cloud) id, along with the
   * space keys the owner allowlisted.
   */
  findIntegrationByCloudId: (cloudId: string) => Promise<
    | (ResolvedWebhookIntegration & {
        selectedSpaceKeys: readonly string[];
      })
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

      const integration = await findIntegrationByCloudId(cloudId);

      if (integration === null) {
        return null;
      }

      // Forge sends events for every space on the site, but the owner may
      // have allowlisted only some. A genuine event from an unselected space
      // is dropped rather than rejected.
      const spaceKey = spaceKeyOf(payload);

      if (
        spaceKey !== null &&
        !integration.selectedSpaceKeys.includes(spaceKey)
      ) {
        return "ignore";
      }

      return {
        notificationEventKeys: integration.notificationEventKeys,
        workspaceId: integration.workspaceId,
      };
    },
    translate: (payload) => translateConfluenceWebhookEvent(payload),
  });
}
