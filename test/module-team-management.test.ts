import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODULE_TEAM_CONFIGS } from "../src/modules/staff/module-team-config";

const root = resolve(__dirname, "..");

describe("shared module team management", () => {
  it("defines the expected membership-only module teams and fixed role families", () => {
    expect(Object.keys(MODULE_TEAM_CONFIGS).sort()).toEqual(["accounting", "analytics", "crm", "hospital", "hotel", "inventory", "payroll", "pharmacy", "pos", "procurement", "projects"]);
    expect(MODULE_TEAM_CONFIGS.hospital.roleNames).toContain("Doctor");
    expect(MODULE_TEAM_CONFIGS.hotel.roleNames).toContain("Housekeeper");
    expect(MODULE_TEAM_CONFIGS.pharmacy.roleNames).toContain("Pharmacist");
  });

  it("enforces tenant, module, permission, fixed-role, seat, platform-user, and self-edit boundaries", () => {
    const actions = readFileSync(resolve(root, "src/app/app/[moduleKey]/staff/actions.ts"), "utf8");
    expect(actions).toContain("requireModuleAccess(config.key)");
    expect(actions).toContain("hasPermission(tenant, config.managePermission)");
    expect(actions).toContain("organizationId: tenant.organizationId");
    expect(actions).toContain("name: { in: [...config.roleNames] }");
    expect(actions).toContain("assertRoleHasAvailableSeats");
    expect(actions).toContain("isPlatformUser");
    expect(actions).toContain("member.userId === tenant.userId");
  });

  it("exposes the team workflow from every configured module navigation", () => {
    for (const moduleKey of ["crm", "accounting", "payroll", "analytics", "pos", "projects", "hotel", "pharmacy", "hospital"]) {
      const navigation = readFileSync(resolve(root, `src/modules/${moduleKey}/navigation.tsx`), "utf8");
      expect(navigation).toContain(`/app/${moduleKey}/staff`);
    }
    const combined = readFileSync(resolve(root, "src/modules/inventory-procurement/navigation.tsx"), "utf8");
    expect(combined).toContain("/app/inventory/staff");
    expect(combined).toContain("/app/procurement/staff");
  });

  it("renders the Team page inside that module's own AppShell, not the bare authenticated layout", () => {
    // The [moduleKey] route segment had no layout.tsx of its own when this shared
    // Team page shipped, so it rendered directly under src/app/app/layout.tsx (auth
    // and providers only, no AppShell) - losing the sidebar entirely and stretching
    // full-width, the exact symptom reported for /app/pos/staff. A module-specific
    // page never has this bug because its own layout.tsx always wraps it in AppShell;
    // this dynamic route needs the same layout.tsx, just resolving which module's
    // navigation/sectionLabel to use from the moduleKey param instead of a fixed one.
    const layout = readFileSync(resolve(root, "src/app/app/[moduleKey]/layout.tsx"), "utf8");
    expect(layout).toContain("<AppShell");
    expect(layout).toContain("requireCurrentTenant");
    expect(layout).toContain("canAccessModule(tenant, config.key)");
    for (const moduleKey of Object.keys(MODULE_TEAM_CONFIGS)) {
      expect(layout, `missing sidebar chrome for "${moduleKey}"`).toContain(`case "${moduleKey}"`);
    }
  });
});
