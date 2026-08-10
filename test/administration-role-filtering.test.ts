import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/app/(overview)/administration/page.tsx", "utf8");
const actions = readFileSync("src/app/app/(overview)/administration/actions.ts", "utf8");
const filtering = readFileSync("src/lib/administration-roles.ts", "utf8");

describe("administration role filtering", () => {
  it("builds the role selector from the tenant's enabled modules", () => {
    expect(page).not.toContain("INVITABLE_ROLE_NAMES");
    expect(page).toContain("assignableRoles");
    expect(page).toContain("tenant.enabledModuleKeys");
    expect(filtering).toContain("moduleRegistry.find");
    expect(filtering).toContain("enabledModules.has(moduleKey)");
  });

  it("enforces the same module compatibility in the invitation action", () => {
    expect(actions).toContain("isRoleAssignableToOrganization(");
    expect(actions).toContain("tenant.enabledModuleKeys");
    expect(actions).toContain("rolePermissions: { include: { permission: true } }");
  });

  it("keeps Organization Owner assignable but never exposes Super Admin", () => {
    expect(filtering).toContain('role.name === "Super Admin"');
    expect(filtering).toContain('role.name === "Organization Owner"');
  });
});
