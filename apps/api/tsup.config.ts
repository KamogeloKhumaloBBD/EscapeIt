import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/server.ts"],
  format: ["esm"],
  noExternal: [
    "@context-layer/db",
    "@context-layer/email",
    "@context-layer/integrations",
    "@context-layer/security",
  ],
  sourcemap: true,
  splitting: false,
  target: "node24",
});
