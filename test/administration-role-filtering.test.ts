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
