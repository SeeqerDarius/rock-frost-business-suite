/**
 * Seeds minimum required platform data (permissions/system roles/modules)
 * into the disposable integration-test database — never DATABASE_URL.
 * Guarded by the same assertSafeTestDatabase() every integration test
 * itself goes through. Idempotent; safe to re-run.
 *
 * In practice, test/integration/setup/fixtures.ts's ensurePlatformSeeded()
 * already does this automatically the first time any suite calls
 * createTestOrg(), so running this script by hand is only needed to
 * pre-warm a freshly migrated database before the test run (e.g. in CI, to
 * keep seeding out of the first test's timing) — see .github/workflows/ci.yml.
 *
 * Run with: npm run db:test:seed
 */
import { PrismaClient } from "@prisma/client";
import { assertSafeTestDatabase } from "../test/integration/setup/guard";
import { seedPlatform } from "../prisma/seed-data";

const testDatabaseUrl = assertSafeTestDatabase();
const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });

seedPlatform(db)
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
