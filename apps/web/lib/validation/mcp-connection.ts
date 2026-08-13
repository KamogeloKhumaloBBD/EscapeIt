import { z } from "zod";

export const mcpOAuthConnectionSchema = z.object({
  authorizedAt: z.coerce.date(),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  consentId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
});

export const mcpConnectionsPayloadSchema = z.object({
  connections: z.array(mcpOAuthConnectionSchema),
  requestedClient: z
    .object({
      clientId: z.string().min(1),
      clientName: z.string().min(1),
    })
    .nullable(),
});

export type McpOAuthConnection = z.infer<typeof mcpOAuthConnectionSchema>;
