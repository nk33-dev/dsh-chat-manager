import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: "esm",
    platform: "node",
    clean: false,
    dts: false,
    outputOptions: { entryFileNames: "[name].js" },
  },
  {
    entry: { remote: "src/shared/remote.ts" },
    outDir: "lib",
    format: "esm",
    platform: "neutral",
    clean: false,
    dts: false,
    outputOptions: { entryFileNames: "[name].js" },
  },
]);
