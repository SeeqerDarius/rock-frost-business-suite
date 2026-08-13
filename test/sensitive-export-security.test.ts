import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const permissions = readFileSync("src/lib/auth/permissions.ts", "utf8");
const seed = readFileSync("prisma/seed-data.ts", "utf8");
const auditExport = readFileSync("src/app/api/audit-log/export/route.ts", "utf8");

describe("sensitive export controls", () => {
  it("keeps data export separate from workspace settings in runtime and seed permissions", () => {
    expect(permissions).toContain('ORG_DATA_EXPORT: "org.data.export"');
    expect(seed).toContain('ORG_DATA_EXPORT: "org.data.export"');
  });

  it("neutralizes spreadsheet formulas and prevents audit exports from being cached", () => {
    expect(auditExport).toContain("/^[=+\\-@]/");
    expect(auditExport).toContain('"Cache-Control": "private, no-store"');
  });
});
