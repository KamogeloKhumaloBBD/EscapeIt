import { z } from "zod";

const connectionStatusSchema = z.enum(["connected", "disconnected", "error"]);

const notificationChannelSchema = z.object({
  id: z.string(),
  lastErrorCode: z.string().nullable(),
  lastValidatedAt: z.iso.datetime().nullable(),
  name: z.string(),
  provider: z.string(),
  sourceProviders: z.array(z.string()),
  status: connectionStatusSchema,
});

const notificationPreferenceSchema = z.object({
  defaultEnabled: z.boolean(),
  displayName: z.string(),
  enabled: z.boolean(),
  eventKey: z.string(),
});

export const notificationChannelListSchema = z.array(notificationChannelSchema);
export const notificationPreferenceListSchema = z.array(
  notificationPreferenceSchema,
);

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type NotificationPreference = z.infer<
  typeof notificationPreferenceSchema
>;
