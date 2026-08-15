export function customMcpClientMetadataUrl(
  publicAppUrl: string,
): string | undefined {
  const url = new URL(publicAppUrl);
  if (url.protocol !== "https:") return undefined;
  return `${publicAppUrl.replace(/\/$/, "")}/oauth/custom-mcp-client.json`;
}
