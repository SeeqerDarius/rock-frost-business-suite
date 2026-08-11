import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const downloadRoute = readFileSync("src/app/api/organization/backup/route.ts", "utf8");
const restoreRoute = readFileSync("src/app/api/organization/backup/restore/route.ts", "utf8");
const page = readFileSync("src/app/app/(overview)/organization/backups/page.tsx", "utf8");
const controls = readFileSync("src/app/app/(overview)/organization/backups/backup-controls.tsx", "utf8");

describe("active-module backup routes", () => {
  it("resolves active subscription scope on download and rejects inactive modules", () => {
    expect(downloadRoute).toContain("resolveActiveTenantModuleKeys");
    expect(downloadRoute).toContain("resolveBackupModules");
    expect(downloadRoute).toContain('status: 403');
  });

  it("enforces the same active-module boundary during restore", () => {
    expect(restoreRoute).toContain("resolveActiveTenantModuleKeys");
    expect(restoreRoute).toContain("activeBackupModules");
    expect(restoreRoute).toContain("contains inactive-module data");
  });

  it("shows only active module choices and labels all scope accurately", () => {
    expect(page).toContain("activeModules={activeModules}");
    expect(controls).toContain("activeModules.map");
    expect(controls).not.toContain("BACKUP_MODULES.map");
    expect(controls).toContain("All active modules");
    expect(controls).toContain("No active modules are available to back up");
  });
});
