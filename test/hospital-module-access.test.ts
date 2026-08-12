import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dedicated Hospital counterpart to test/module-access.test.ts's "module
 * authorization source coverage" checks. Hospital is not folded into that
 * shared file's MODULE_KEYS list — Hotel and School aren't either, so a new
 * vertical gets its own dedicated file rather than editing a file another
 * agent also maintains.
 */

const mockRequireCurrentTenant = vi.fn();

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("@/lib/tenant", () => ({ requireCurrentTenant: mockRequireCurrentTenant }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { requireModuleAccess } = await import("@/lib/auth/module-access");
const { canAccessModule, hasPermission } = await import("@/lib/auth/permissions");

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    organizationId: "org-1",
    organization: { id: "org-1", name: "Org", tenantCode: "org", industry: null, status: "ACTIVE" },
    role: "Member",
    roleId: "role-1",
    roleIsSystem: false,
    roleOrganizationId: "org-1",
    permissions: ["hospital.view"],
    branch: null,
    enabledModuleKeys: ["hospital"],
    accessibleModuleKeys: ["hospital"],
    memberships: [{ organizationId: "org-1", name: "Org", tenantCode: "org" }],
    ...overrides,
  };
}

function collectEntryFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectEntryFiles(absolutePath);
    return entry.name === "page.tsx" || entry.name === "actions.ts" ? [absolutePath] : [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hospital module-aware authorization", () => {
  it("allows the module when the user has a matching permission and it's enabled", async () => {
    const currentTenant = tenant();
    mockRequireCurrentTenant.mockResolvedValue(currentTenant);

    await expect(requireModuleAccess("hospital")).resolves.toBe(currentTenant);
    expect(canAccessModule(currentTenant, "hospital")).toBe(true);
  });

  it("denies access when the module is disabled even though the role retains its permission", async () => {
    const currentTenant = tenant({ enabledModuleKeys: [], accessibleModuleKeys: [] });
    mockRequireCurrentTenant.mockResolvedValue(currentTenant);

    await expect(requireModuleAccess("hospital")).rejects.toThrow("module-unavailable");
    expect(hasPermission(currentTenant, "hospital.view")).toBe(false);
  });

  it("denies access when the module is enabled but the user holds no hospital.* permission", async () => {
    mockRequireCurrentTenant.mockResolvedValue(
      tenant({ permissions: ["org.settings.manage"], accessibleModuleKeys: [] }),
    );

    await expect(requireModuleAccess("hospital")).rejects.toThrow("module-unavailable");
  });

  it("grants module entry on a narrow permission like hospital.lab.manage without hospital.view", () => {
    const currentTenant = tenant({ permissions: ["hospital.lab.manage"] });
    expect(canAccessModule(currentTenant, "hospital")).toBe(true);
  });
});

describe("hospital authorization source coverage", () => {
  it("guards every hospital page and action with requireModuleAccess(\"hospital\"), never a bare requireCurrentTenant", () => {
    const moduleDirectory = path.join(process.cwd(), "src", "app", "app", "hospital");
    const guardedFiles = collectEntryFiles(moduleDirectory);

    expect(guardedFiles.filter((filePath) => filePath.endsWith("page.tsx"))).toHaveLength(14);
    expect(guardedFiles.filter((filePath) => filePath.endsWith("actions.ts"))).toHaveLength(1);

    for (const filePath of guardedFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source, filePath).toContain('requireModuleAccess("hospital")');
      expect(source, filePath).not.toContain("requireCurrentTenant");
    }
  });

  it("guards the layout with canAccessModule rather than a redirect, and the dashboard widget with requireModuleAccess", () => {
    const layoutPath = path.join(process.cwd(), "src", "app", "app", "hospital", "layout.tsx");
    const layoutSource = readFileSync(layoutPath, "utf8");
    expect(layoutSource).toContain("requireCurrentTenant");
    expect(layoutSource).toContain('canAccessModule(tenant, "hospital")');

    const widgetPath = path.join(process.cwd(), "src", "modules", "hospital", "dashboard-widget.tsx");
    expect(readFileSync(widgetPath, "utf8")).toContain('requireModuleAccess("hospital")');
  });

  it("is registered in the module registry, permissions, seed data, and backup scopes", () => {
    const registrySource = readFileSync(path.join(process.cwd(), "src", "platform", "modules", "registry.ts"), "utf8");
    expect(registrySource).toContain('key: "hospital"');
    expect(registrySource).toContain('permissionPrefix: "hospital."');

    const permissionsSource = readFileSync(path.join(process.cwd(), "src", "lib", "auth", "permissions.ts"), "utf8");
    expect(permissionsSource).toContain('HOSPITAL_VIEW: "hospital.view"');

    const seedSource = readFileSync(path.join(process.cwd(), "prisma", "seed-data.ts"), "utf8");
    expect(seedSource).toContain('HOSPITAL_VIEW: "hospital.view"');
    expect(seedSource).toContain('"Hospital Administrator"');
    expect(seedSource).toContain('{ code: "hospital", name: "Hospital Management" }');

    const backupScopesSource = readFileSync(path.join(process.cwd(), "src", "lib", "backup", "scopes.ts"), "utf8");
    expect(backupScopesSource).toContain('"hospital"');

    const backupModelSource = readFileSync(path.join(process.cwd(), "src", "lib", "backup", "tenant-backup.ts"), "utf8");
    expect(backupModelSource).toContain('hospital: ["Hospital"]');
  });

  it("keeps every hospital.* permission key identical between the app and the seed duplicate", async () => {
    const { PERMISSIONS: appPermissions } = await import("@/lib/auth/permissions");
    const seedModule = await import("../prisma/seed-data");
    const hospitalKeys = Object.keys(appPermissions).filter((key) => key.startsWith("HOSPITAL_"));
    expect(hospitalKeys.length).toBeGreaterThan(0);
    for (const key of hospitalKeys) {
      expect(seedModule.PERMISSIONS, key).toHaveProperty(key, (appPermissions as Record<string, string>)[key]);
    }

    const rolesWithHospitalPermissions = Object.entries(seedModule.ROLE_PERMISSIONS)
      .filter(([, keys]) => keys.some((key) => key.startsWith("hospital.")))
      .map(([role]) => role);
    expect(rolesWithHospitalPermissions).toEqual(expect.arrayContaining([
      "Hospital Administrator", "Receptionist", "Doctor", "Nurse", "Laboratory Scientist",
      "Radiology Staff", "Hospital Pharmacist", "Billing Officer", "Records Officer",
    ]));
  });
});
