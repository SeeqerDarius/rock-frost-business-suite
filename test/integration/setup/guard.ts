/**
 * Hard safeguard against ever running integration tests against a real
 * database. Every integration test file imports its Prisma client from
 * `./db.ts`, which calls `assertSafeTestDatabase()` at module load time —
 * there is no code path in test/integration/** that can construct a
 * database connection without going through this check first.
 *
 * This is deliberately paranoid and deliberately loud (throws, not a
 * console warning) — an integration test suite running destructive writes
 * against the wrong database is a production-incident-shaped bug, not a
 * test failure.
 */

const REQUIRED_NAME_MARKER = "test";
const PRODUCTION_MARKERS = ["prod", "production"];

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function hostnameOf(raw: string): string | null {
  return parseUrl(raw)?.hostname.toLowerCase() ?? null;
}

function databaseNameOf(raw: string): string | null {
  const url = parseUrl(raw);
  if (!url) return null;
  return url.pathname.replace(/^\//, "").toLowerCase();
}

/**
 * Throws with a specific, actionable message on any condition that could
 * plausibly mean "this is about to run against a real database." Returns
 * the validated TEST_DATABASE_URL on success.
 */
export function assertSafeTestDatabase(): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run integration tests: NODE_ENV is 'production'. Integration tests must never execute in a production environment.",
    );
  }

  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing to run integration tests: VERCEL_ENV is 'production'.");
  }

  if (process.env.ALLOW_INTEGRATION_TESTS !== "1") {
    throw new Error(
      "Refusing to run integration tests: ALLOW_INTEGRATION_TESTS=1 is required as an explicit, deliberate opt-in. " +
        "This exists so an integration suite can never run as a side effect of a normal `npm test` or an unrelated CI step. " +
        "Set it only in the dedicated `npm run test:integration` script / CI job.",
    );
  }

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      "Refusing to run integration tests: TEST_DATABASE_URL is not set. Integration tests require a dedicated, " +
        "disposable database connection string — never the application's own DATABASE_URL. See docs/TESTING_STRATEGY.md.",
    );
  }

  const testHost = hostnameOf(testUrl);
  const testDbName = databaseNameOf(testUrl);
  if (!testHost || !testDbName) {
    throw new Error("Refusing to run integration tests: TEST_DATABASE_URL is not a valid Postgres connection string.");
  }

  if (!testDbName.includes(REQUIRED_NAME_MARKER)) {
    throw new Error(
      `Refusing to run integration tests: the test database name ("${testDbName}") does not contain "test". ` +
        `Name the disposable database (or its Neon branch) so it contains "test" — this lets the guard, and any human ` +
        `glancing at a connection string, tell it apart from a real database at a glance.`,
    );
  }

  if (PRODUCTION_MARKERS.some((marker) => testHost.includes(marker) || testDbName.includes(marker))) {
    throw new Error(
      `Refusing to run integration tests: TEST_DATABASE_URL's host or database name looks like a production ` +
        `identifier ("${testHost}"/"${testDbName}").`,
    );
  }

  const appUrl = process.env.DATABASE_URL;
  if (appUrl) {
    if (testUrl === appUrl) {
      throw new Error("Refusing to run integration tests: TEST_DATABASE_URL is identical to DATABASE_URL.");
    }
    const appHost = hostnameOf(appUrl);
    const appDbName = databaseNameOf(appUrl);
    if (appHost && appDbName && appHost === testHost && appDbName === testDbName) {
      throw new Error(
        "Refusing to run integration tests: TEST_DATABASE_URL and DATABASE_URL point at the same host and database name.",
      );
    }
  }

  const directUrl = process.env.DIRECT_URL;
  if (directUrl && directUrl === testUrl) {
    throw new Error("Refusing to run integration tests: TEST_DATABASE_URL is identical to DIRECT_URL.");
  }

  return testUrl;
}
