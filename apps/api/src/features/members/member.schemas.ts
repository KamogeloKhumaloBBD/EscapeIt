import { z } from "zod";

export const createInvitationSchema = z.object({
  email: z
    .email()
    .max(320)
    .transform((email) => email.trim().toLowerCase()),
});

export const invitationIdSchema = z.uuid();

export const invitationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "The invitation token is invalid.");

export const invitationTokenBodySchema = z.object({
  token: invitationTokenSchema,
});
