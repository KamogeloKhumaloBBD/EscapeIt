import "server-only";

import type { ZodType } from "zod";

import { requestApi } from "@/lib/server/api-client";
import {
  notificationChannelListSchema,
  notificationPreferenceListSchema,
  type NotificationChannel,
  type NotificationPreference,
} from "@/lib/validation/notification";

type ApiState<T> =
  | { status: "anonymous" }
  | { data: T; status: "available" }
  | { status: "not-found" }
  | { status: "unavailable" };

function parseData<T>(data: unknown, schema: ZodType<T>): T | null {
  if (typeof data !== "object" || data === null || !("data" in data)) {
    return null;
  }

  const parsed = schema.safeParse(Reflect.get(data, "data"));
  return parsed.success && parsed.data !== undefined ? parsed.data : null;
}

async function requestState<T>(
  path: `/api/${string}`,
  schema: ZodType<T>,
): Promise<ApiState<T>> {
  const result = await requestApi(path);

  if (result.status === 401) {
    return { status: "anonymous" };
  }

  if (result.status === 404) {
    return { status: "not-found" };
  }

  if (!result.ok) {
    return { status: "unavailable" };
  }

  const data = parseData(result.data, schema);
  return data === null
    ? { status: "unavailable" }
    : { data, status: "available" };
}

export function getNotificationChannelsState(): Promise<
  ApiState<NotificationChannel[]>
> {
  return requestState(
    "/api/notifications/channels",
    notificationChannelListSchema,
  );
}

export function getNotificationPreferencesState(): Promise<
  ApiState<NotificationPreference[]>
> {
  return requestState(
    "/api/notifications/preferences",
    notificationPreferenceListSchema,
  );
}
