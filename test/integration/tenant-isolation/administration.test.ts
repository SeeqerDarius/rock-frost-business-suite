import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Administration has no service.ts — the role-scoping logic that
 * `inviteMember()` in src/app/app/(overview)/administration/actions.ts relies
 * on lives directly in that Server Action:
 *
 *   const role = await db.role.findFirst({
 *     where: { id: roleId, OR: [{ organizationId: tenant.organizationId }, { isSystem: true }] },
 *   });
 *
 * `inviteMember` itself isn't practically callable here: it starts with
 * `await requireCurrentTenant()`, which reads the current tenant out of a
 * real Next.js request context (cookies/headers) that doesn't exist outside
 * a live request. Instead, this test proves the underlying invariant that
 * query is meant to enforce directly against real Postgres: a role scoped to
 * Org B is never resolved by that same query shape when run for Org A,
 * regardless of whether Org A supplies its own id or Org B's role id as the
 * lookup target — while a system role (isSystem: true) remains resolvable
 * for any organization, since that's the legitimate use of the OR clause.
 */

let orgA: TestOrg;
let orgB: TestOrg;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-administration");
  orgB = await createTestOrg("orgB-administration");
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Administration — role scoping used by inviteMember()", () => {
  it("a role scoped to Org B is not resolved by Org A's role lookup", async () => {
    const roleB = await testDb.role.create({
      data: { organizationId: orgB.organizationId, name: "OrgB Custom Role" },
    });

    const resolvedForOrgA = await testDb.role.findFirst({
      where: { id: roleB.id, OR: [{ organizationId: orgA.organizationId }, { isSystem: true }] },
    });

    expect(resolvedForOrgA).toBeNull();
  });

  it("the same role IS resolved by Org B's own role lookup (sanity: the query itself works)", async () => {
    const roleB = await testDb.role.create({
      data: { organizationId: orgB.organizationId, name: "OrgB Custom Role 2" },
    });

    const resolvedForOrgB = await testDb.role.findFirst({
      where: { id: roleB.id, OR: [{ organizationId: orgB.organizationId }, { isSystem: true }] },
    });

    expect(resolvedForOrgB?.id).toBe(roleB.id);
  });

  it("a system role is resolved regardless of which organization looks it up", async () => {
    const systemRole = await testDb.role.findFirst({ where: { organizationId: null, isSystem: true } });
    expect(systemRole).not.toBeNull();

    const resolvedForOrgA = await testDb.role.findFirst({
      where: { id: systemRole!.id, OR: [{ organizationId: orgA.organizationId }, { isSystem: true }] },
    });
    const resolvedForOrgB = await testDb.role.findFirst({
      where: { id: systemRole!.id, OR: [{ organizationId: orgB.organizationId }, { isSystem: true }] },
    });

    expect(resolvedForOrgA?.id).toBe(systemRole!.id);
    expect(resolvedForOrgB?.id).toBe(systemRole!.id);
  });

  it("a plain org-scoped listing of roles for Org A never includes Org B's role", async () => {
    const roleB = await testDb.role.create({
      data: { organizationId: orgB.organizationId, name: "OrgB Custom Role 3" },
    });

    const orgARoles = await testDb.role.findMany({ where: { organizationId: orgA.organizationId } });

    expect(orgARoles.map((r) => r.id)).not.toContain(roleB.id);
  });
});
