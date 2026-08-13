import { z } from "zod";

export const providerParameterSchema = z.string().min(1).max(63);

export const oauthCallbackSchema = z.object({
  code: z.string().min(1).max(2_048),
  state: z.string().min(1).max(2_048),
});

export const installationSelectionSchema = z.object({
  externalId: z.string().min(1).max(500),
});

export const scopeSelectionSchema = z.object({
  externalIds: z.array(z.string().min(1).max(500)).max(100),
});

export const mcpToolSelectionSchema = z.object({
  toolNames: z
    .array(
      z
        .string()
        .min(3)
        .max(128)
        .regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/),
    )
    .max(100),
});

export const scopeDiscoveryQuerySchema = z.object({
  cursor: z.string().max(64).optional(),
  query: z.string().trim().max(120).default(""),
});

export const notificationsToggleSchema = z.object({
  enabled: z.boolean(),
});
