import { z } from "zod";

const statusSchema = z.enum(["connected", "disconnected", "error"]);

export const customMcpToolSchema = z.object({
  available: z.boolean(),
  description: z.string(),
  enabled: z.boolean(),
  exposedName: z.string(),
  id: z.string(),
  kind: z.enum(["read", "write"]),
  title: z.string(),
  upstreamName: z.string(),
});

export const customMcpServerSchema = z.object({
  authenticationKind: z.enum(["none", "oauth", "bearer"]),
  currentAccount: z
    .object({
      authMethod: z.enum(["oauth", "bearer"]),
      lastValidatedAt: z.iso.datetime().nullable(),
      status: statusSchema,
    })
    .nullable(),
  endpointUrl: z.string(),
  id: z.string(),
  lastValidatedAt: z.iso.datetime().nullable(),
  name: z.string(),
  nextStep: z.enum([
    "connect_account",
    "ready",
    "select_tools",
    "wait_for_owner",
  ]),
  permissions: z.object({
    canConnectAccount: z.boolean(),
    canManageServer: z.boolean(),
    canManageTools: z.boolean(),
  }),
  slug: z.string(),
  status: statusSchema,
  tools: z.array(customMcpToolSchema),
});

export const customMcpServerListSchema = z.array(customMcpServerSchema);

export const customMcpNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a server name.")
  .max(120, "Server names must be 120 characters or fewer.");

export const customMcpEndpointSchema = z
  .url("Enter a valid HTTPS MCP endpoint.")
  .trim()
  .refine((value) => value.startsWith("https://"), "Use an HTTPS endpoint.");

export type CustomMcpServer = z.infer<typeof customMcpServerSchema>;
export type CustomMcpTool = z.infer<typeof customMcpToolSchema>;
