import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProxyRewrites } from "../next.config";

describe("Next.js backend routing", () => {
  it("routes MCP paths before the generic API and well-known fallbacks", () => {
    const rewrites = createProxyRewrites(
      "http://api.railway.internal:4000/",
      "http://mcp.railway.internal:4100/",
    );

    assert.deepEqual(rewrites.slice(0, 4), [
      {
        destination: "http://mcp.railway.internal:4100/api/mcp",
        source: "/api/mcp",
      },
      {
        destination:
          "http://mcp.railway.internal:4100/api/mcp/.well-known/oauth-protected-resource",
        source: "/api/mcp/.well-known/oauth-protected-resource",
      },
      {
        destination:
          "http://mcp.railway.internal:4100/.well-known/oauth-protected-resource",
        source: "/.well-known/oauth-protected-resource",
      },
      {
        destination:
          "http://mcp.railway.internal:4100/.well-known/oauth-protected-resource/api/mcp",
        source: "/.well-known/oauth-protected-resource/api/mcp",
      },
    ]);
    assert.deepEqual(rewrites.slice(4), [
      {
        destination: "http://api.railway.internal:4000/.well-known/:path*",
        source: "/.well-known/:path*",
      },
      {
        destination: "http://api.railway.internal:4000/api/:path*",
        source: "/api/:path*",
      },
    ]);
  });

  it("rejects non-HTTP internal targets", () => {
    assert.throws(
      () => createProxyRewrites("file:///api", "http://localhost:4100"),
      /API_INTERNAL_URL/,
    );
    assert.throws(
      () => createProxyRewrites("http://localhost:4000", "file:///mcp"),
      /MCP_INTERNAL_URL/,
    );
  });
});
