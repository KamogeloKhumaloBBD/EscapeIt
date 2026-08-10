import { z } from "zod";

export const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z
        .email({ error: "Enter a valid email address." })
        .max(254, "Enter a valid email address."),
    ),
});

export const otpSchema = emailSchema.extend({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email."),
});
