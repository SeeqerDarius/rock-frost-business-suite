import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIGURABLE_FEATURES,
  configurableFeature,
  featureChangeBlocker,
  featuresForModule,
  moduleChangeBlocker,
} from "@/platform/modules/feature-catalogue";
import { moduleRegistry } from "@/platform/modules/registry";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const schema = read("prisma/schema.prisma");
const organizationModel = schema.slice(schema.indexOf("model Organization {"), schema.indexOf("\n}", schema.indexOf("model Organization {")));
const allValues = (overrides: Record<string, boolean> = {}) => ({
  ...Object.fromEntries(CONFIGURABLE_FEATURES.map((feature) => [feature.key, feature.defaultEnabled])),
  ...overrides,
});

describe("module feature catalogue", () => {
  it("declares each feature once, with real storage and real routes", () => {
    const keys = CONFIGURABLE_FEATURES.map((feature) => feature.key);
    expect(new Set(keys).size).toBe(keys.length);
    const routes = new Set(moduleRegistry.flatMap((module_) => module_.navigation.map((item) => item.href)));
    for (const feature of CONFIGURABLE_FEATURES) {
      if (feature.storage.kind === "organizationGrant") {
        expect(organizationModel, feature.key).toContain(`${feature.storage.grantField} `);
        expect(organizationModel, feature.key).toContain(`${feature.storage.grantedAtField} `);
        expect(organizationModel, feature.key).toContain(`${feature.storage.grantField.replace(/Granted$/, "GrantedById")} `);
        expect(feature.defaultEnabled, `${feature.key} add-ons start off`).toBe(false);
      } else {
        expect(feature.defaultEnabled, `${feature.key} included capabilities start on`).toBe(true);
      }
      for (const route of feature.routes) expect(routes.has(route), `${feature.key} ${route}`).toBe(true);
      for (const required of feature.requires) expect(configurableFeature(required), required).toBeDefined();
    }
  });

  it("enforces every optional capability on the server where it lives", () => {
    const service = read("src/modules/school/service.ts");
    for (const feature of CONFIGURABLE_FEATURES.filter((entry) => entry.kind === "optional")) {
      // Every exported function touching that area must check the setting.
      const area = feature.key === "school.transport" ? /export (async )?function (\w*SchoolTransport\w*)\(/g : /export (async )?function (\w*SchoolLibrary\w*)\(/g;
      const functions = [...service.matchAll(area)].map((match) => match[2]);
      expect(functions.length, feature.key).toBeGreaterThan(2);
      for (const name of functions) {
        const body = service.slice(service.indexOf(`function ${name}(`));
        const end = body.indexOf("\nexport ", 5);
        expect(body.slice(0, end === -1 ? undefined : end), `${name} checks ${feature.key}`).toContain(`assertSchoolFeature(organizationId, "${feature.key}")`);
      }
    }
    expect(read("src/modules/school/navigation-access.ts")).toContain("optionalFeatures.transport &&");
    expect(read("src/modules/school/navigation-access.ts")).toContain("optionalFeatures.library &&");
  });

  it("lists the School features on School and organization-wide add-ons on every module they reach", () => {
    expect(featuresForModule("school").map((feature) => feature.key)).toEqual(["offlineAccess", "smsNotifications", "schoolPortal", "schoolGuardianMessaging", "schoolAssignments", "school.transport", "school.library"]);
    expect(featuresForModule("hotel").map((feature) => feature.key)).toEqual(["offlineAccess", "smsNotifications"]);
    expect(featuresForModule("crm")).toEqual([]);
  });

  it("refuses invalid feature combinations with a plain reason", () => {
    expect(featureChangeBlocker("schoolGuardianMessaging", true, allValues({ schoolPortal: false }))).toMatch(/Turn on Parent and Student portal first/);
    expect(featureChangeBlocker("schoolGuardianMessaging", true, allValues({ schoolPortal: true }))).toBeNull();
    expect(featureChangeBlocker("schoolPortal", false, allValues({ schoolPortal: true, schoolGuardianMessaging: true }))).toMatch(/Turn off Guardian messaging first/);
    expect(featureChangeBlocker("schoolPortal", false, allValues({ schoolPortal: true, schoolGuardianMessaging: false }))).toBeNull();
    // A soft recommendation is never a hard block.
    expect(featureChangeBlocker("schoolAssignments", true, allValues({ schoolPortal: false }))).toBeNull();
  });

  it("refuses invalid module combinations", () => {
    const name = (code: string) => ({ school: "School Management", hostel: "Hostel Management" })[code] ?? code;
    expect(moduleChangeBlocker("hostel", true, [], name)).toMatch(/Switch on School Management first/);
    expect(moduleChangeBlocker("hostel", true, ["school"], name)).toBeNull();
    expect(moduleChangeBlocker("school", false, ["school", "hostel"], name)).toMatch(/Switch off Hostel Management first/);
    expect(moduleChangeBlocker("school", false, ["school"], name)).toBeNull();
    expect(moduleChangeBlocker("crm", true, [], name)).toBeNull();
  });
});

const mockDb = {
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  organization: { findUnique: vi.fn(), update: vi.fn() },
  organizationFeatureSetting: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
};
const mockLogAuditEvent = vi.fn();
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));

const grants = (overrides: Record<string, boolean> = {}) => ({
  id: "org-1",
  name: "Test School",
  offlineAccessGranted: false,
  smsNotificationsGranted: false,
  schoolPortalGranted: false,
  schoolGuardianMessagingGranted: false,
  schoolAssignmentsGranted: false,
  ...overrides,
});

describe("setOrganizationFeature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
    mockDb.organizationFeatureSetting.findMany.mockResolvedValue([]);
  });

  it("switches an included capability off, writing a setting row and an audit entry with old and new values", async () => {
    const { setOrganizationFeature } = await import("@/platform/organizations/feature-config-service");
    mockDb.organization.findUnique.mockResolvedValue(grants());
    const result = await setOrganizationFeature({ actorUserId: "operator-1", organizationId: "org-1", moduleKey: "school", featureKey: "school.transport", enabled: false, expected: true });
    expect(result).toEqual({ changed: true, previous: true, next: false });
    expect(mockDb.organizationFeatureSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_featureKey: { organizationId: "org-1", featureKey: "school.transport" } },
      create: expect.objectContaining({ organizationId: "org-1", moduleKey: "school", enabled: false, updatedById: "operator-1" }),
    }));
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      userId: "operator-1",
      action: "organization_feature.updated",
      metadata: expect.objectContaining({ module: "school", feature: "school.transport", oldValue: true, newValue: false, organization: "Test School" }),
    }), mockDb);
  });

  it("grants an add-on in its existing column, stamping who and when", async () => {
    const { setOrganizationFeature } = await import("@/platform/organizations/feature-config-service");
    mockDb.organization.findUnique.mockResolvedValue(grants());
    await setOrganizationFeature({ actorUserId: "operator-1", organizationId: "org-1", moduleKey: "school", featureKey: "schoolPortal", enabled: true, expected: false });
    expect(mockDb.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { schoolPortalGranted: true, schoolPortalGrantedAt: expect.any(Date), schoolPortalGrantedById: "operator-1" },
    });
  });

  it("refuses a stale change instead of overwriting someone else's", async () => {
    const { setOrganizationFeature, FeatureChangeError } = await import("@/platform/organizations/feature-config-service");
    mockDb.organization.findUnique.mockResolvedValue(grants({ schoolPortalGranted: true }));
    await expect(setOrganizationFeature({ actorUserId: "operator-1", organizationId: "org-1", moduleKey: "school", featureKey: "schoolPortal", enabled: true, expected: false })).rejects.toMatchObject({ code: "stale" });
    await expect(setOrganizationFeature({ actorUserId: "operator-1", organizationId: "org-1", moduleKey: "school", featureKey: "schoolPortal", enabled: true, expected: false })).rejects.toBeInstanceOf(FeatureChangeError);
    expect(mockDb.organization.update).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses a dependency violation and writes nothing", async () => {
    const { setOrganizationFeature } = await import("@/platform/organizations/feature-config-service");
    mockDb.organization.findUnique.mockResolvedValue(grants({ schoolPortalGranted: true, schoolGuardianMessagingGranted: true }));
    await expect(setOrganizationFeature({ actorUserId: "operator-1", organizationId: "org-1", moduleKey: "school", featureKey: "schoolPortal", enabled: false, expected: true })).rejects.toMatchObject({ code: "dependency" });
    expect(mockDb.organization.update).not.toHaveBeenCalled();
  });

  it("refuses a feature that does not belong to the module", async () => {
    const { setOrganizationFeature } = await import("@/platform/organizations/feature-config-service");
    await expect(setOrganizationFeature({ actorUserId: "operator-1", organizationId: "org-1", moduleKey: "hotel", featureKey: "school.transport", enabled: false, expected: true })).rejects.toMatchObject({ code: "unknown-feature" });
    await expect(setOrganizationFeature({ actorUserId: "operator-1", organizationId: "org-1", moduleKey: "school", featureKey: "made.up", enabled: false, expected: true })).rejects.toMatchObject({ code: "unknown-feature" });
  });

  it("reads an absent setting as the catalogue default", async () => {
    const { isOrganizationFeatureEnabled } = await import("@/platform/organizations/feature-config-service");
    mockDb.organizationFeatureSetting.findUnique.mockResolvedValueOnce(null);
    expect(await isOrganizationFeatureEnabled("org-1", "school.library")).toBe(true);
    mockDb.organizationFeatureSetting.findUnique.mockResolvedValueOnce({ enabled: false });
    expect(await isOrganizationFeatureEnabled("org-1", "school.library")).toBe(false);
  });
});

describe("module configuration pages and actions", () => {
  const actions = read("src/app/app/platform/organizations/[organizationId]/modules/[moduleId]/actions.ts");
  const page = read("src/app/app/platform/organizations/[organizationId]/modules/[moduleId]/page.tsx");
  const toggle = read("src/app/app/platform/actions.ts");

  it("re-verifies the platform operator and refuses the protected organization in every write", () => {
    const featureAction = actions.slice(actions.indexOf("export async function setOrganizationFeatureAction"));
    expect(featureAction).toContain("isPlatformOperator(tenant)");
    expect(featureAction).toContain("isPlatformAnchorOrganization(");
    const jsonAction = actions.slice(actions.indexOf("export async function updateOrganizationModuleConfiguration"), actions.indexOf("export async function setOrganizationFeatureAction"));
    expect(jsonAction).toContain("isPlatformAnchorOrganization(");
    const moduleToggle = toggle.slice(toggle.indexOf("export async function toggleOrganizationModule"), toggle.indexOf("const offlineAccessSchema"));
    expect(moduleToggle).toContain("isPlatformOperator(tenant)");
    expect(moduleToggle).toContain("isPlatformAnchorOrganization(");
    expect(moduleToggle).toContain("moduleChangeBlocker(");
    expect(moduleToggle).toContain("oldValue: previous, newValue: enabled");
  });

  it("is operator-only and never claims an add-on is billed", () => {
    expect(page).toContain("await requirePlatformOperator()");
    expect(page).toContain("does not create a subscription");
    expect(page).not.toMatch(/\bwill be (billed|charged)\b/i);
  });

  it("keeps platform entitlements out of the tenant-editable settings JSON", () => {
    expect(page).toContain("They are not entitlements");
    expect(read("src/platform/organizations/feature-config-service.ts")).not.toContain("organizationModule.");
  });

  it("uses no em dash in operator or tenant copy", () => {
    const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of [
      "src/platform/modules/feature-catalogue.ts",
      "src/platform/organizations/module-configuration-view.ts",
      "src/platform/organizations/feature-config-service.ts",
      "src/app/app/platform/organizations/[organizationId]/modules/[moduleId]/page.tsx",
      "src/app/app/platform/organizations/[organizationId]/modules/[moduleId]/confirmed-switch.tsx",
      "src/app/app/platform/organizations/[organizationId]/sections/features-section.tsx",
      "src/components/school/switched-off-notice.tsx",
    ]) expect(strip(read(file)).includes("—"), file).toBe(false);
  });
});
