/**
 * Idempotent platform bootstrap seed CLI — safe to re-run. Delegates to
 * `seedPlatform()` in prisma/seed-data.ts (which has no import-time side
 * effects and is also used by the integration test fixtures against the
 * disposable test database) — this file is just the CLI entrypoint that
 * constructs a real PrismaClient against DATABASE_URL and calls it.
 *
 * Deliberately does NOT create a demo organization, demo users, or enable
 * any module for a specific organization — that's tenant-level bootstrap
 * data, not platform bootstrap.
 *
 * Run with: npx tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { seedPlatform } from "./seed-data";

async function main() {
  const db = new PrismaClient();
  try {
    await seedPlatform(db);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
