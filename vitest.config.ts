import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Non-recursive: only picks up test/*.test.ts (the mocked-db unit
    // suite), never test/integration/**/*.test.ts or test/e2e/**/*.test.ts
    // — those are real-database suites with their own configs
    // (vitest.integration.config.ts) and must never run as a side effect
    // of a plain `npm run test`.
    include: ["test/*.test.ts"],
  },
});
