"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { NotificationActionState } from "@/app/(workspace)/integrations/[provider]/notification-action-state";
import { requestApi } from "@/lib/server/api-client";
import { apiErrorMessage } from "@/lib/server/api-error";

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
    channelId: z.string().min(1),
    intent: z.literal("set-channel-sources"),
    providers: z.array(z.string().min(1)).max(50),
  }),
]);

export async function notificationAction(
  _previousState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const intent = formData.get("intent");
  const raw =
    intent === "set-channel-sources"
      ? {
          channelId: formData.get("channelId"),
          intent,
          providers: formData.getAll("providers"),
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
    case "set-channel-sources":
      result = await requestApi(
        `/api/notifications/channels/${encodeURIComponent(parsed.data.channelId)}/sources`,
        {
          body: { providers: parsed.data.providers },
          method: "PUT",
        },
      );
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
      message: apiErrorMessage(
        result,
        "We couldn't complete that action. Review the channel and try again.",
      ),
      status: "error",
    };
  }

  if (parsed.data.intent === "delete-channel") {
    revalidatePath("/integrations/teams");
  }

  const messages: Record<(typeof parsed.data)["intent"], string> = {
    "delete-channel": "The notification channel was removed.",
    "set-channel-sources": "Channel subscriptions were updated.",
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
      message: apiErrorMessage(
        result,
        "We couldn't add the channel. Review the webhook URL and try again.",
      ),
      status: "error",
    };
  }

  revalidatePath("/integrations/teams");
  return { message: "The Teams channel was connected.", status: "success" };
}

const updateChannelSchema = createChannelSchema.extend({
  channelId: z.string().min(1),
});

export async function updateChannelAction(
  _previousState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const parsed = updateChannelSchema.safeParse({
    channelId: formData.get("channelId"),
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

  const result = await requestApi(
    `/api/notifications/channels/${encodeURIComponent(parsed.data.channelId)}`,
    {
      body: {
        name: parsed.data.name,
        webhookUrl: parsed.data.webhookUrl,
      },
      method: "PUT",
    },
  );

  if (result.status === 401) redirect("/sign-in");

  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "We couldn't update the channel. Review the webhook URL and try again.",
      ),
      status: "error",
    };
  }

  revalidatePath("/integrations/teams");
  return {
    message: "The Teams channel was updated and its connection is healthy.",
    status: "success",
  };
}
