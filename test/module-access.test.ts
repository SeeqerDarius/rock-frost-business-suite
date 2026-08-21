import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { requireModuleAccess, requirePlatformOperator } = await import("@/lib/auth/module-access");
const { canAccessModule, hasPermission, isPlatformOperator } = await import("@/lib/auth/permissions");

// hotel, pharmacy, and hospital are not swept here — a pre-existing gap
// (present before this list started tracking School/Hostel too), not
// something introduced by this change. Their pages are guarded the same
// way the swept modules are, just not exercised by this specific test.
const MODULE_KEYS = [
  "fleet",
  "installment",
  "crm",
  "inventory",
  "accounting",
  "hr",
  "procurement",
  "payroll",
  "analytics",
  "pos",
  "projects",
  "school",
  "hostel",
] as const;

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    organizationId: "org-1",
    organization: { id: "org-1", name: "Org", tenantCode: "org", industry: null, status: "ACTIVE" },
    role: "Member",
    roleId: "role-1",
    roleIsSystem: false,
    roleOrganizationId: "org-1",
    permissions: ["fleet.view"],
    branch: null,
    enabledModuleKeys: ["fleet"],
    accessibleModuleKeys: ["fleet"],
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

describe("module-aware authorization", () => {
  it("allows an enabled module when the user has a matching permission", async () => {
    const currentTenant = tenant();
    mockRequireCurrentTenant.mockResolvedValue(currentTenant);

    await expect(requireModuleAccess("fleet")).resolves.toBe(currentTenant);
    expect(canAccessModule(currentTenant, "fleet")).toBe(true);
  });

  it("denies a disabled module even when the role retains its permission", async () => {
    const currentTenant = tenant({ enabledModuleKeys: [], accessibleModuleKeys: [] });
    mockRequireCurrentTenant.mockResolvedValue(currentTenant);

    await expect(requireModuleAccess("fleet")).rejects.toThrow("module-unavailable");
    expect(hasPermission(currentTenant, "fleet.view")).toBe(false);
  });

  it("denies an enabled module when the user has no matching permission", async () => {
    mockRequireCurrentTenant.mockResolvedValue(
      tenant({ permissions: ["org.settings.manage"], accessibleModuleKeys: [] }),
    );

    await expect(requireModuleAccess("fleet")).rejects.toThrow("module-unavailable");
  });

  it("fails closed for an unknown module key", async () => {
    mockRequireCurrentTenant.mockResolvedValue(tenant());

    await expect(requireModuleAccess("unknown" as never)).rejects.toThrow("module-unavailable");
  });

  it("maps the installment module to the hirepurchase permission prefix", async () => {
    const currentTenant = tenant({
      permissions: ["hirepurchase.customers.manage"],
      enabledModuleKeys: ["installment"],
      accessibleModuleKeys: ["installment"],
    });
    mockRequireCurrentTenant.mockResolvedValue(currentTenant);

    await expect(requireModuleAccess("installment")).resolves.toBe(currentTenant);
  });

  it("allows a narrow module permission while leaving global permissions module-neutral", () => {
    const currentTenant = tenant({ permissions: ["fleet.investor.view", "org.settings.manage"] });

    expect(canAccessModule(currentTenant, "fleet")).toBe(true);
    expect(hasPermission(currentTenant, "org.settings.manage")).toBe(true);
  });

  it("requires platform role provenance, not only the Super Admin display name", async () => {
    const spoofedTenant = tenant({ role: "Super Admin", roleIsSystem: false, roleOrganizationId: "org-1" });
    mockRequireCurrentTenant.mockResolvedValue(spoofedTenant);
    expect(isPlatformOperator(spoofedTenant)).toBe(false);
    await expect(requirePlatformOperator()).rejects.toThrow("forbidden");

    const operatorTenant = tenant({ role: "Super Admin", roleIsSystem: true, roleOrganizationId: null });
    mockRequireCurrentTenant.mockResolvedValue(operatorTenant);
    expect(isPlatformOperator(operatorTenant)).toBe(true);
    await expect(requirePlatformOperator()).resolves.toBe(operatorTenant);
  });
});

describe("module authorization source coverage", () => {
  it("guards every module page and action with its route module key", () => {
    const guardedFiles = MODULE_KEYS.flatMap((moduleKey) => {
      const moduleDirectory = path.join(process.cwd(), "src", "app", "app", moduleKey);
      return collectEntryFiles(moduleDirectory).map((filePath) => ({ moduleKey, filePath }));
    });

    // 102, up from 95: Hostel's 7 page.tsx files (overview, buildings,
    // allocations, wardens, fees, reports, settings) join the sweep now
    // that "hostel" is in MODULE_KEYS above. Before that, 95 was up from 94
    // because src/app/app/accounting/petty-cash/page.tsx is a new guarded
    // page (requireModuleAccess("accounting")) added for the petty cash
    // workflow, and 94 was up from 80 because School's 14 page.tsx files
    // were never included in this sweep (School was missing from
    // MODULE_KEYS entirely, a real coverage gap the offline expansion's
    // milestone 11 hardening pass found and fixed - the pages themselves
    // were already correctly guarded, this sweep just was not exercising
    // them).
    // 103: Inventory's controlled physical-count workflow adds one guarded page.
    expect(guardedFiles.filter(({ filePath }) => filePath.endsWith("page.tsx"))).toHaveLength(103);
    // 52, up from 51: src/app/app/accounting/petty-cash/actions.ts is a new
    // 53, up from 52: src/app/app/hostel/actions.ts (one shared file for
    // all Hostel Server Actions, same shape as School's) joins the sweep
    // now that "hostel" is in MODULE_KEYS. Before that, 52 was up from 51
    // because src/app/app/accounting/petty-cash/actions.ts is a new
    // guarded actions file for the petty cash workflow, and 51 was up from
    // 50 because School's single actions.ts was included for the same
    // reason as the page.tsx count above.
    // 54: the stock-count Server Actions are independently guarded as well.
    expect(guardedFiles.filter(({ filePath }) => filePath.endsWith("actions.ts"))).toHaveLength(54);

    for (const { moduleKey, filePath } of guardedFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source, filePath).toContain(`requireModuleAccess("${moduleKey}")`);
      expect(source, filePath).not.toContain("requireCurrentTenant");
    }
  });

  it("guards every module dashboard widget and every platform page at the leaf boundary", () => {
    const widgetKeys = MODULE_KEYS.filter((moduleKey) => moduleKey !== "analytics");
    for (const moduleKey of widgetKeys) {
      const widgetPath = path.join(process.cwd(), "src", "modules", moduleKey, "dashboard-widget.tsx");
      const source = readFileSync(widgetPath, "utf8");
      expect(source, widgetPath).toContain(`requireModuleAccess("${moduleKey}")`);
    }

    for (const pageName of ["dashboard", "organizations", "modules", "activity", "subscriptions"]) {
      const pagePath = path.join(process.cwd(), "src", "app", "app", "platform", pageName, "page.tsx");
      expect(readFileSync(pagePath, "utf8"), pagePath).toContain("requirePlatformOperator()");
    }
  });
});
