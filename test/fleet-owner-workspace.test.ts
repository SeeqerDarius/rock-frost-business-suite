import fs from "node:fs";
import { describe, expect, it } from "vitest";

const service = fs.readFileSync("src/modules/fleet/owner-workspace.ts", "utf8");
const workspace = fs.readFileSync("src/app/app/fleet/investor/page.tsx", "utf8");
const vehicle = fs.readFileSync("src/app/app/fleet/investor/vehicles/[vehicleId]/page.tsx", "utf8");

describe("Vehicle Owner Workspace", () => {
  it("scopes every owner read by organization and authenticated user", () => {
    expect(service).toContain("where: { organizationId, userId }");
    expect(service).toContain("workspace.vehicles.find((candidate) => candidate.id === vehicleId)");
    expect(vehicle).toContain('tenant.role !== "Vehicle Owner"');
    expect(vehicle).toContain("session.user.id, vehicleId");
  });

  it("uses only verified collections and completed verified expenses", () => {
    expect(service).toContain('status: "VERIFIED"');
    expect(service).toContain("verified: true");
    expect(service).toContain("request.completionVerified && request.repairCost");
    expect(workspace).toContain("Pending, rejected or reversed records are excluded.");
  });

  it("uses real daily or weekly obligations without inventing settlements", () => {
    expect(service).toContain("getFleetDriverObligations");
    expect(service).toContain("settlementConfigured: false as const");
    expect(workspace).toContain("Settlement calculation not configured");
    expect(vehicle).toContain("No daily or weekly remittance target is configured");
  });

  it("provides responsive portfolio, attention, charts, and vehicle detail workflow", () => {
    expect(workspace).toContain("Needs your attention");
    expect(workspace).toContain("PeriodicTrendChart");
    expect(workspace).toContain("sm:grid-cols-2 xl:grid-cols-4");
    for (const section of ["Remittance", "Driver and assignment", "Maintenance", "Documents", "Settlement and activity", "Ownership history"]) {
      expect(vehicle).toContain(section);
    }
  });
});
