import type { RequestHandler } from "express";

export interface McpOAuthMetadataDependencies {
  publicAppUrl: string;
}

export function createProtectedResourceMetadataHandler({
  publicAppUrl,
}: McpOAuthMetadataDependencies): RequestHandler {
  const origin = publicAppUrl.replace(/\/$/, "");

  return (_request, response) => {
    response.setHeader("Cache-Control", "public, max-age=300");
    response.status(200).json({
      authorization_servers: [`${origin}/api/auth`],
      bearer_methods_supported: ["header"],
      resource: `${origin}/api/mcp`,
      resource_documentation: `${origin}/agent-setup`,
      resource_name: "Context Layer MCP",
      scopes_supported: ["mcp:access"],
    });
  };
}
