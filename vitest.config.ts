import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/plugin/tests/**/*.test.{ts,tsx}"],
    testTimeout: 15000,
  },
});
