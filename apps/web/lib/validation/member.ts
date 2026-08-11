import { z } from "zod";

export const invitationEmailSchema = z
  .email("Enter a valid email address.")
  .max(320, "Email addresses must be 320 characters or fewer.")
  .transform((email) => email.trim().toLowerCase());

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const memberListSchema = z.object({
  members: z.array(
    z.object({
      email: z.string(),
      joinedAt: z.iso.datetime(),
      membershipId: z.string(),
      name: z.string(),
      role: z.enum(["owner", "member"]),
    }),
  ),
  pendingInvitations: z
    .array(
      z.object({
        createdAt: z.iso.datetime(),
        email: z.string(),
        expiresAt: z.iso.datetime(),
        id: z.string(),
      }),
    )
    .nullable(),
  permissions: z.object({ canInvite: z.boolean() }),
  role: z.enum(["owner", "member"]),
  workspaceName: z.string(),
});

export const invitationPreviewSchema = z.object({
  expiresAt: z.iso.datetime(),
  inviterName: z.string(),
  workspaceName: z.string(),
});

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
export type MemberList = z.infer<typeof memberListSchema>;
