import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/server.ts"],
  format: ["esm"],
  noExternal: ["@context-layer/db"],
  sourcemap: true,
  splitting: false,
  target: "node24",
});
