import path from "node:path";

import type { NextConfig } from "next";

const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
const parsedApiInternalUrl = new URL(apiInternalUrl);

if (!["http:", "https:"].includes(parsedApiInternalUrl.protocol)) {
  throw new Error("API_INTERNAL_URL must use HTTP or HTTPS.");
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  rewrites() {
    return Promise.resolve([
      {
        destination: `${apiInternalUrl.replace(/\/$/, "")}/api/:path*`,
        source: "/api/:path*",
      },
    ]);
  },
};

export default nextConfig;
