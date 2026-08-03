import { assertSafeTestDatabase } from "./guard";

// Validate the dedicated database before application services are imported,
// then point their shared Prisma client at that same disposable database.
// The original application URLs are checked by the guard before mutation.
const testDatabaseUrl = assertSafeTestDatabase();
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_URL = testDatabaseUrl;
