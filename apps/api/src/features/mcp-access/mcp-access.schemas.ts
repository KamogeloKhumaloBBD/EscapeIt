import { z } from "zod";

export const createMcpTokenSchema = z.object({
  bundleId: z.uuid("The bundle identifier is invalid.").optional(),
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for this token.")
    .max(120, "Token names must be 120 characters or fewer."),
});

export const mcpTokenIdSchema = z.uuid("The token identifier is invalid.");
