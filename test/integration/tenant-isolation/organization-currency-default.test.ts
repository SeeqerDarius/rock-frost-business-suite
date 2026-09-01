import { describe, it, expect, afterAll } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres proof that Organization.currency's schema default is now
 * GHS: createTestOrg() (like every real signup path) creates the row
 * without specifying a currency, so this exercises the database's own
 * DEFAULT clause rather than an application-level fallback. Forward-only:
 * this says nothing about, and never touches, any organization that already
 * had its currency set before this migration.
 */
const orgs: TestOrg[] = [];

afterAll(async () => {
  await Promise.all(orgs.map((org) => cleanupTestOrg(org)));
});

describe("Organization.currency default", () => {
  it("defaults a newly created organization to GHS when no currency is supplied", async () => {
    const org = await createTestOrg("currency-default");
    orgs.push(org);

    const row = await testDb.organization.findUniqueOrThrow({ where: { id: org.organizationId }, select: { currency: true } });

    expect(row.currency).toBe("GHS");
  });

  it("still honors an explicitly supplied currency, forward or otherwise", async () => {
    const explicit = await testDb.organization.create({
      data: { name: "Explicit currency org", tenantCode: `itest-explicit-currency-${Date.now()}`, status: "ACTIVE", currency: "USD" },
    });
    try {
      expect(explicit.currency).toBe("USD");
    } finally {
      await testDb.organization.delete({ where: { id: explicit.id } }).catch(() => {});
    }
  });
});
