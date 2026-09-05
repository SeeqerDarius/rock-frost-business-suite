import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/app/(overview)/administration/page.tsx", "utf8");
const actions = readFileSync("src/app/app/(overview)/administration/actions.ts", "utf8");
const filtering = readFileSync("src/lib/administration-roles.ts", "utf8");
const activeModules = readFileSync("src/lib/active-tenant-modules.ts", "utf8");

describe("administration role filtering", () => {
  it("builds the role selector from the tenant's enabled modules", () => {
    expect(page).not.toContain("INVITABLE_ROLE_NAMES");
    expect(page).toContain("assignableRoles");
    expect(page).toContain("resolveAssignableModuleKeys");
    expect(filtering).toContain("moduleRegistry.find");
    expect(filtering).toContain("enabledModules.has(moduleKey)");
  });

  it("enforces the same module compatibility in the invitation action", () => {
    expect(actions).toContain("isRoleAssignableToOrganization(");
    expect(actions).toContain("resolveAssignableModuleKeys");
    expect(actions).toContain("rolePermissions: { include: { permission: true } }");
  });

  it("prefers active subscriptions and presents a compact, product-named selector", () => {
    expect(activeModules).toContain('status: "ACTIVE"');
    expect(filtering).toContain('return "Installment Manager"');
    expect(page).toContain('alignItemWithTrigger={false}');
    expect(page).toContain('className="max-h-72"');
  });

  it("keeps Organization Owner assignable but never exposes Super Admin", () => {
    expect(filtering).toContain('role.name === "Super Admin"');
    expect(filtering).toContain('role.name === "Organization Owner"');
  });
});

/**
 * Regression test for a live production bug (reported with a screenshot): a
 * member's Role dropdown showed a raw database id (e.g. "cms1cozex002dc...")
 * instead of a role name. Root cause: a member can hold a role that's since
 * fallen out of `assignableRoles` (e.g. the org's module subscription
 * changed after the role was granted), and the Select's `items` map - which
 * SelectValue uses to look up the display label for the current value - was
 * built from `assignableRoles` alone, with no entry for that member's actual
 * role. Fixed by including each member's own current role in its row's
 * option list even when it isn't otherwise assignable, and by no-op'ing a
 * changeMemberRole submission that resubmits a member's own unchanged role
 * instead of re-validating it as a fresh grant.
 */
describe("a member's current role is never dropped from its own row, even if no longer assignable", () => {
  it("computes a per-row role list that always includes the member's own current role", () => {
    expect(page).toContain("rowRoles");
    expect(page).toContain("!assignableRoles.some((role) => role.id === member.role!.id)");
    expect(page).toContain("[...assignableRoles, member.role]");
    // The Select's `items` map and its rendered <SelectItem> options must
    // both be built from the per-row list, not the page-wide assignable list.
    expect(page).toContain("items={Object.fromEntries(rowRoles.map(");
    expect(page).toContain("{rowRoles.map((role) => <SelectItem");
  });

  it("changeMemberRole never re-validates a resubmission of a member's own unchanged role", () => {
    expect(actions).toContain("if (existingMember?.roleId === parsed.data.roleId) redirect(\"/app/administration?roleChanged=1\")");
  });
});
