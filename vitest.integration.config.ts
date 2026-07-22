import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Real-PostgreSQL integration/concurrency test config — separate from
 * vitest.config.ts (the mocked-db unit suite) on purpose. Run via
 * `npm run test:integration`, which sets ALLOW_INTEGRATION_TESTS=1;
 * test/integration/setup/guard.ts refuses to run without it.
 *
 * Single fork, no file parallelism: every suite writes real rows to one
 * shared disposable database, and while each suite creates its own
 * isolated organization, running whole test *files* concurrently against
 * one Postgres instance adds connection-pool pressure and cross-file
 * interleaving that isn't worth the speed here. Concurrency *within* a
 * single test (the actual thing being tested) still uses real
 * Promise.all() against real overlapping transactions.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    // Vitest does NOT auto-load .env the way Next.js does — without this,
    // a TEST_DATABASE_URL sitting in .env would silently never reach
    // process.env here, and every test would fail at the guard with a
    // confusing "not set" error despite the variable genuinely being
    // configured. dotenv/config's side effect on import loads .env from
    // the current working directory (the repo root, since these tests
    // are always run via `npm run test:integration` from there).
    setupFiles: ["dotenv/config"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
