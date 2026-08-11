import { describe, expect, it } from "vitest";
import { parseBackupScope, resolveBackupModules, validateTenantBackup } from "@/lib/backup/tenant-backup";

const organizationId = "org-1";
const tenantCode = "ACME";

function backup(overrides: Record<string, unknown> = {}) {
  return {
    kind: "ROCK_FROST_TENANT_BACKUP",
    version: 1,
    generatedAt: new Date().toISOString(),
    organizationId,
    tenantCode,
    scope: "fleet",
    includedModules: ["fleet"],
    models: { FleetOwner: [{ id: "owner-1", organizationId, name: "Owner" }] },
    ...overrides,
  };
}

describe("tenant backup security boundary", () => {
  it("accepts only declared module scopes", () => {
    expect(parseBackupScope(null)).toBe("all");
    expect(parseBackupScope("analytics")).toBe("analytics");
    expect(parseBackupScope("unknown")).toBeNull();
  });

  it("accepts a same-tenant backup with an allowed model", () => {
    expect(validateTenantBackup(backup(), organizationId, tenantCode)).toBe(true);
  });

  it("rejects another tenant, missing scope, and models outside the selected module", () => {
    expect(validateTenantBackup(backup({ organizationId: "org-2" }), organizationId, tenantCode)).toBe(false);
    expect(validateTenantBackup(backup({ scope: undefined }), organizationId, tenantCode)).toBe(false);
    expect(validateTenantBackup(backup({ models: { User: [{ id: "user-1", organizationId }] } }), organizationId, tenantCode)).toBe(false);
  });

  it("rejects a cross-tenant row even inside an otherwise valid backup", () => {
    expect(validateTenantBackup(backup({
      models: { FleetOwner: [{ id: "owner-1", organizationId: "org-2" }] },
    }), organizationId, tenantCode)).toBe(false);
  });

  it("allows only active modules and treats all as all active modules", () => {
    expect(resolveBackupModules("fleet", ["school"])).toBeNull();
    expect(resolveBackupModules("school", ["school"])).toEqual(["school"]);
    expect(resolveBackupModules("all", ["school", "hotel"])).toEqual(["school", "hotel"]);
    expect(resolveBackupModules("all", [])).toBeNull();
    expect(validateTenantBackup(backup(), organizationId, tenantCode, ["school"])).toBe(false);
  });

  it("rejects an all-scope backup that declares an inactive module", () => {
    expect(validateTenantBackup(backup({
      scope: "all",
      includedModules: ["fleet", "school"],
      models: { FleetOwner: [{ id: "owner-1", organizationId }] },
    }), organizationId, tenantCode, ["school"])).toBe(false);
  });
});
