import { z } from "zod";

export const providerParameterSchema = z.string().min(1).max(63);

export const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(120),
  provider: providerParameterSchema,
  webhookUrl: z.url().max(2_048),
});

export const updateChannelSchema = z.object({
  name: z.string().trim().min(1).max(120),
  webhookUrl: z.url().max(2_048),
});

export const preferenceOverrideSchema = z.object({
  enabled: z.boolean(),
  eventKey: z.string().min(1).max(191),
});

export const channelParameterSchema = z.object({
  channelId: z.string().min(1).max(191),
});
