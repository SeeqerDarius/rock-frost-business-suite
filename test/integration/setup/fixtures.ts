/**
 * Shared fixtures for integration tests: creates a fresh, fully isolated
 * organization (with one ACTIVE-member user and every module enabled) per
 * test suite, and tears it down afterward. Every unique field is suffixed
 * with a random run id so suites never collide, including when run in
 * parallel.
 */
import bcrypt from "bcryptjs";
import { testDb } from "./db";
import { seedPlatform } from "../../../prisma/seed-data";

let platformSeedPromise: Promise<void> | null = null;

/**
 * Idempotent — seeds permissions/system roles/modules into the test database
 * exactly once per test process. Concurrent callers (e.g. a beforeAll that
 * creates two orgs via Promise.all) must await the same in-flight seed
 * rather than each independently checking a boolean flag and racing to seed
 * twice — a plain `if (seeded) return; ...; seeded = true` guard has a
 * check-then-act gap wide enough for both to see "not seeded yet" and both
 * call seedPlatform() concurrently, which then throws a real unique-
 * constraint violation on its own upserts.
 */
export async function ensurePlatformSeeded() {
  if (!platformSeedPromise) {
    platformSeedPromise = seedPlatform(testDb, { log: false });
  }
  await platformSeedPromise;
}

export interface TestOrg {
  organizationId: string;
  userId: string;
  membershipId: string;
  tenantCode: string;
}

/**
 * Creates one organization, one ACTIVE user/membership pair with the
 * Organization Owner role, and enables every module for it. Returns just
 * the ids most tests need — fetch the full rows from `testDb` if a test
 * needs more.
 */
export async function createTestOrg(label: string): Promise<TestOrg> {
  await ensurePlatformSeeded();
  const runId = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const organization = await testDb.organization.create({
    data: {
      name: `Integration Test Org ${runId}`,
      tenantCode: `itest-${runId}`,
      status: "ACTIVE",
    },
  });

  const user = await testDb.user.create({
    data: {
      name: `Integration Test User ${runId}`,
      email: `itest-${runId}@example.invalid`,
      passwordHash: await bcrypt.hash("not-a-real-password", 4),
      status: "ACTIVE",
    },
  });

  const ownerRole = await testDb.role.findFirst({ where: { organizationId: null, name: "Organization Owner" } });
  if (!ownerRole) {
    throw new Error("Organization Owner system role not found — ensurePlatformSeeded() should have created it.");
  }

  const membership = await testDb.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });

  const modules = await testDb.module.findMany();
  if (modules.length > 0) {
    await testDb.organizationModule.createMany({
      data: modules.map((m) => ({ organizationId: organization.id, moduleId: m.id, enabled: true, enabledAt: new Date() })),
    });
  }

  return { organizationId: organization.id, userId: user.id, membershipId: membership.id, tenantCode: organization.tenantCode };
}

/**
 * Deletes an organization (cascading, via the schema's onDelete: Cascade
 * relations, to every row it owns across every module) and its user.
 * Order matters: the organization must go first, since the user row itself
 * isn't owned by the organization and would otherwise be left orphaned
 * with no member row pointing at it (harmless, but untidy).
 */
export async function cleanupTestOrg(org: TestOrg) {
  await testDb.organization.delete({ where: { id: org.organizationId } }).catch(() => {});
  await testDb.user.delete({ where: { id: org.userId } }).catch(() => {});
}

/**
 * Adds a second ACTIVE user/membership pair (Organization Owner role, same
 * as the org's original user) to an already-created test org — for tests
 * that need to prove two members of the *same* organization are still kept
 * apart from each other (e.g. per-user support conversations). Caller is
 * responsible for deleting the returned user id during cleanup; the
 * membership and any per-user rows it owns are cascade-deleted along with
 * the organization by cleanupTestOrg.
 */
export async function addSecondTestMember(org: TestOrg, label: string): Promise<{ userId: string; membershipId: string }> {
  const runId = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const user = await testDb.user.create({
    data: {
      name: `Integration Test User ${runId}`,
      email: `itest-${runId}@example.invalid`,
      passwordHash: await bcrypt.hash("not-a-real-password", 4),
      status: "ACTIVE",
    },
  });

  const ownerRole = await testDb.role.findFirst({ where: { organizationId: null, name: "Organization Owner" } });
  if (!ownerRole) {
    throw new Error("Organization Owner system role not found — ensurePlatformSeeded() should have created it.");
  }

  const membership = await testDb.organizationMember.create({
    data: {
      organizationId: org.organizationId,
      userId: user.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });

  return { userId: user.id, membershipId: membership.id };
}
