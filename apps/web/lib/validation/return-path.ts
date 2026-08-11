import { z } from "zod";

const invitationReturnPathSchema = z
  .string()
  .regex(/^\/invite\/[A-Za-z0-9_-]{43}$/);

export function safeReturnPath(value: unknown): string | null {
  const parsed = invitationReturnPathSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
