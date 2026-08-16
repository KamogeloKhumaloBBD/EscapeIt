import { defineConfig } from "tsup";

export default defineConfig({
  // The bundled MCP runtime includes Undici, whose CommonJS internals require
  // Node built-ins dynamically. ESM bundles need a scoped require bridge.
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  clean: true,
  dts: false,
  entry: ["src/server.ts"],
  format: ["esm"],
  noExternal: [
    "@context-layer/db",
    "@context-layer/email",
    "@context-layer/integrations",
    "@context-layer/mcp-runtime",
    "@context-layer/security",
  ],
  sourcemap: true,
  splitting: false,
  target: "node24",
});
