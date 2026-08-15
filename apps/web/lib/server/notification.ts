import "server-only";

import { requestState, type ApiState } from "@/lib/server/api-state";
import {
  notificationChannelListSchema,
  notificationPreferenceListSchema,
  type NotificationChannel,
  type NotificationPreference,
} from "@/lib/validation/notification";

export function getNotificationChannelsState(): Promise<
  ApiState<NotificationChannel[]>
> {
  return requestState(
    "/api/notifications/channels",
    notificationChannelListSchema,
    "We couldn't load notification channels. Refresh the page to try again.",
  );
}

export function getNotificationPreferencesState(): Promise<
  ApiState<NotificationPreference[]>
> {
  return requestState(
    "/api/notifications/preferences",
    notificationPreferenceListSchema,
    "We couldn't load notification preferences. Refresh the page to try again.",
  );
}
