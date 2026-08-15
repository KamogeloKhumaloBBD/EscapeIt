import path from "node:path";

import type { NextConfig } from "next";

export function createProxyRewrites(
  apiInternalUrl: string,
  mcpInternalUrl: string,
) {
  const parsedApiInternalUrl = new URL(apiInternalUrl);
  const parsedMcpInternalUrl = new URL(mcpInternalUrl);

  if (!["http:", "https:"].includes(parsedApiInternalUrl.protocol)) {
    throw new Error("API_INTERNAL_URL must use HTTP or HTTPS.");
  }

  if (!["http:", "https:"].includes(parsedMcpInternalUrl.protocol)) {
    throw new Error("MCP_INTERNAL_URL must use HTTP or HTTPS.");
  }

  const normalizedApiInternalUrl = apiInternalUrl.replace(/\/$/, "");
  const normalizedMcpInternalUrl = mcpInternalUrl.replace(/\/$/, "");

  return [
    {
      destination: `${normalizedMcpInternalUrl}/api/mcp`,
      source: "/api/mcp",
    },
    {
      destination: `${normalizedMcpInternalUrl}/api/mcp/.well-known/oauth-protected-resource`,
      source: "/api/mcp/.well-known/oauth-protected-resource",
    },
    {
      destination: `${normalizedMcpInternalUrl}/.well-known/oauth-protected-resource`,
      source: "/.well-known/oauth-protected-resource",
    },
    {
      destination: `${normalizedMcpInternalUrl}/.well-known/oauth-protected-resource/api/mcp`,
      source: "/.well-known/oauth-protected-resource/api/mcp",
    },
    {
      destination: `${normalizedApiInternalUrl}/.well-known/:path*`,
      source: "/.well-known/:path*",
    },
    {
      destination: `${normalizedApiInternalUrl}/api/:path*`,
      source: "/api/:path*",
    },
  ];
}

const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
const mcpInternalUrl = process.env.MCP_INTERNAL_URL ?? "http://localhost:4100";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  rewrites() {
    return Promise.resolve(createProxyRewrites(apiInternalUrl, mcpInternalUrl));
  },
};

export default nextConfig;
