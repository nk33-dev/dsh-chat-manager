import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { client: "src/client/index.tsx" },
  outDir: "lib",
  format: "cjs",
  platform: "browser",
  clean: false,
  dts: false,
  target: "es2022",
  deps: {
    neverBundle: [
      "react",
      "react/jsx-runtime",
      "react-dom",
      "zod",
      "@deepseek-ai/cordis",
      "@deepseek-ai/dsh-client-ui-primitives",
    ],
  },
  inputOptions: { resolve: { mainFields: ["module", "main"] } },
  outputOptions: {
    entryFileNames: "[name].js",
    banner:
      'window.__ModuleLoader__.load({id:"@dsh-chat-manager/plugin",factory:function(require){var module={exports:{}};var exports=module.exports;',
    footer: "return module.exports;}});",
  },
});
