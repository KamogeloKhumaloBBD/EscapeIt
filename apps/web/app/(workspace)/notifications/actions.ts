"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { NotificationActionState } from "@/app/(workspace)/notifications/action-state";
import { requestApi } from "@/lib/server/api-client";

const actionSchema = z.discriminatedUnion("intent", [
  z.object({
    channelId: z.string().min(1),
    intent: z.literal("delete-channel"),
  }),
  z.object({
    channelId: z.string().min(1),
    intent: z.literal("test-channel"),
  }),
  z.object({
    enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
    eventKey: z.string().min(1),
    intent: z.literal("set-preference"),
  }),
]);

export async function notificationAction(
  _previousState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const intent = formData.get("intent");
  const raw =
    intent === "set-preference"
      ? {
          enabled: formData.get("enabled"),
          eventKey: formData.get("eventKey"),
          intent,
        }
      : { channelId: formData.get("channelId"), intent };
  const parsed = actionSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      message: "Review the form and try again.",
      status: "error",
    };
  }

  let result;

  switch (parsed.data.intent) {
    case "delete-channel":
      result = await requestApi(
        `/api/notifications/channels/${encodeURIComponent(parsed.data.channelId)}`,
        { method: "DELETE" },
      );
      break;
    case "set-preference":
      result = await requestApi("/api/notifications/preferences", {
        body: {
          enabled: parsed.data.enabled,
          eventKey: parsed.data.eventKey,
        },
        method: "PUT",
      });
      break;
    case "test-channel":
      result = await requestApi(
        `/api/notifications/channels/${encodeURIComponent(parsed.data.channelId)}/test`,
        { method: "POST" },
      );
      break;
  }

  if (result.status === 401) {
    redirect("/sign-in");
  }

  if (!result.ok) {
    return {
      message:
        result.status === 403
          ? "You don't have permission to make this change."
          : result.status === 502
            ? "Microsoft Teams rejected the request. Check the webhook URL."
            : "We couldn't complete that action. Please try again.",
      status: "error",
    };
  }

  revalidatePath("/notifications");

  const messages: Record<(typeof parsed.data)["intent"], string> = {
    "delete-channel": "The notification channel was removed.",
    "set-preference": "Your notification preference was updated.",
    "test-channel": "A test notification was sent to Teams.",
  };

  return { message: messages[parsed.data.intent], status: "success" };
}

const createChannelSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  webhookUrl: z.url("Enter a valid HTTPS webhook URL"),
});

export async function createChannelAction(
  _previousState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const parsed = createChannelSchema.safeParse({
    name: formData.get("name"),
    webhookUrl: formData.get("webhookUrl"),
  });

  if (!parsed.success) {
    return {
      message:
        parsed.error.issues[0]?.message ?? "Review the form and try again.",
      status: "error",
    };
  }

  const result = await requestApi("/api/notifications/channels", {
    body: {
      name: parsed.data.name,
      provider: "teams",
      webhookUrl: parsed.data.webhookUrl,
    },
    method: "POST",
  });

  if (result.status === 401) {
    redirect("/sign-in");
  }

  if (!result.ok) {
    return {
      message:
        result.status === 403
          ? "You don't have permission to add a notification channel."
          : result.status === 502
            ? "Microsoft Teams rejected the webhook URL. Double-check it and try again."
            : result.status === 400
              ? "The webhook URL must be a valid HTTPS URL."
              : "We couldn't add the channel. Please try again.",
      status: "error",
    };
  }

  revalidatePath("/notifications");
  return { message: "The Teams channel was connected.", status: "success" };
}
