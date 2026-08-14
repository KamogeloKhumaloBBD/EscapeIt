import { z } from "zod";

export const mcpTokenNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name for this token.")
  .max(120, "Token names must be 120 characters or fewer.");

export const mcpTokenIdSchema = z.uuid();

export const mcpTokenSchema = z.object({
  bundle: z.object({ id: z.string(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  creator: z.object({
    email: z.string(),
    membershipId: z.string(),
    name: z.string(),
  }),
  id: z.string(),
  isCurrentMember: z.boolean(),
  lastUsedAt: z.iso.datetime().nullable(),
  name: z.string(),
  permissions: z.object({ canRevoke: z.boolean() }),
  prefix: z.string(),
  revokedAt: z.iso.datetime().nullable(),
  status: z.enum(["active", "revoked"]),
});

export const mcpTokenListSchema = z.object({
  currentMembershipId: z.string(),
  role: z.enum(["owner", "member"]),
  tokens: z.array(mcpTokenSchema),
});

export const createdMcpTokenSchema = z.object({
  rawToken: z.string().regex(/^ctx_mcp_[A-Za-z0-9_-]{43}$/),
  token: mcpTokenSchema,
});

export type McpToken = z.infer<typeof mcpTokenSchema>;
export type McpTokenList = z.infer<typeof mcpTokenListSchema>;
