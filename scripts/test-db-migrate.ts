/**
 * Applies committed migrations to the disposable integration-test database
 * (TEST_DATABASE_URL) — never DATABASE_URL. Reuses the same
 * assertSafeTestDatabase() guard integration tests themselves go through,
 * so this script refuses to run under the same conditions they do.
 *
 * A plain `prisma migrate deploy` reads its connection string from
 * schema.prisma's `env("DATABASE_URL")`, so this spawns it as a child
 * process with DATABASE_URL overridden in-process to TEST_DATABASE_URL's
 * value — the parent process's real DATABASE_URL (and the environment
 * this script was invoked from) is never mutated on disk, only in the
 * child's env.
 *
 * Run with: npm run db:test:migrate
 */
import { spawnSync } from "node:child_process";
import { assertSafeTestDatabase } from "../test/integration/setup/guard";

const testDatabaseUrl = assertSafeTestDatabase();

console.log("Applying migrations to the disposable test database...");

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    DIRECT_URL: testDatabaseUrl,
  },
});

if (result.status !== 0) {
  console.error("Migration against the test database failed.");
  process.exit(result.status ?? 1);
}

console.log("Test database migrated successfully.");
