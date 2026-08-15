import { z } from "zod";

export const customMcpServerIdSchema = z.uuid(
  "The Custom MCP server identifier is invalid.",
);

export const createCustomMcpServerSchema = z.object({
  endpointUrl: z.url("Enter a valid HTTPS MCP endpoint."),
  name: z.string().trim().min(1).max(120),
});

export const renameCustomMcpServerSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const bearerAccountSchema = z.object({
  token: z.string().min(1).max(8192),
});

export const replaceCustomMcpToolsSchema = z.object({
  toolIds: z.array(z.uuid()).max(100),
});

export const customMcpOAuthCallbackSchema = z.looseObject({
  state: z.string().min(1),
});
