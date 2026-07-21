/**
 * The one and only way an integration test gets a database connection.
 * Every test/integration/**\/*.test.ts file imports `testDb` from here —
 * never constructs its own PrismaClient — so assertSafeTestDatabase() runs
 * unconditionally before any query can be made.
 */
import { PrismaClient } from "@prisma/client";
import { assertSafeTestDatabase } from "./guard";

const testDatabaseUrl = assertSafeTestDatabase();

export const testDb = new PrismaClient({
  datasources: { db: { url: testDatabaseUrl } },
});
