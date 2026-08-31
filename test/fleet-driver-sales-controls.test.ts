import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERMISSIONS, ROLE_PERMISSIONS, SYSTEM_ROLES } from "../prisma/seed-data";
import { fleetMaintenancePhotoData, parseFleetMaintenancePhoto } from "@/lib/fleet-maintenance-photo";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Fleet driver remittance controls", () => {
  it("keeps Driver assignment-scoped and makes Vehicle Owner available", () => {
    expect(ROLE_PERMISSIONS.Driver).toContain(PERMISSIONS.FLEET_DRIVER_SELF_SERVICE);
    expect(ROLE_PERMISSIONS.Driver).not.toContain(PERMISSIONS.FLEET_VIEW);
    expect(SYSTEM_ROLES.some((role) => role.name === "Vehicle Owner")).toBe(true);
    expect(ROLE_PERMISSIONS["Vehicle Owner"]).toContain(PERMISSIONS.FLEET_INVESTOR_VIEW);
    expect(ROLE_PERMISSIONS["Vehicle Owner"]).not.toContain(PERMISSIONS.FLEET_VIEW);
  });

  it("exposes the driver workspace and maintenance without granting organization-wide Fleet view", () => {
    // The route-access array moved from fleet/layout.tsx into
    // navigation-access.ts (src/modules/fleet/navigation-access.ts) so the
    // sidebar's cross-module accordion can reuse the same permission check
    // Fleet's own layout uses, rather than a second copy that could drift.
    const layout = read("src/app/app/fleet/layout.tsx");
    const navigationAccess = read("src/modules/fleet/navigation-access.ts");
    const overview = read("src/app/app/fleet/page.tsx");
    expect(navigationAccess).toContain('["/app/fleet/driver-portal", hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)]');
    expect(navigationAccess).toContain("PERMISSIONS.FLEET_DRIVER_SELF_SERVICE");
    expect(layout).toContain("getFleetNavigationForTenant");
    expect(overview).toContain('redirect("/app/fleet/driver-portal")');
  });

  it("submits manager review decisions explicitly and reports the result", () => {
    const controls = read("src/app/app/fleet/payments/submission-review-controls.tsx");
    const actions = read("src/app/app/fleet/payments/actions.ts");
    const page = read("src/app/app/fleet/payments/page.tsx");
    expect(controls).toContain('type="submit"');
    expect(controls).toContain('name="decision" value="approve"');
    expect(controls).toContain('name="decision" value="reject"');
    expect(controls).toContain('"Approving..."');
    expect(actions).toContain('z.enum(["approve", "reject"])');
    expect(actions).toContain('?reviewed=${approved ? "approved" : "rejected"}');
    expect(page).toContain("Driver payment approved and added to the verified Fleet payment ledger.");
  });

  it("keeps every narrow Fleet self-service role (Driver, Mechanic) out of organization-wide module navigation", () => {
    const permissions = read("src/lib/auth/permissions.ts");
    const navigation = read("src/platform/modules/workspace-navigation.tsx");
    const overviewLayout = read("src/app/app/(overview)/layout.tsx");
    const fleetLayout = read("src/app/app/fleet/layout.tsx");
    const modulesPage = read("src/app/app/(overview)/modules/page.tsx");
    const reportsPage = read("src/app/app/(overview)/reports/page.tsx");
    expect(permissions).toContain("export function isFleetDriverRole");
    expect(permissions).toContain("export function isMechanicRole");
    expect(permissions).toContain("export function isNarrowFleetSelfServiceRole");
    expect(permissions).toContain("isFleetDriverRole(tenant) || isMechanicRole(tenant)");
    expect(navigation).toContain("if (!isNarrowFleetSelfServiceRole(tenant))");
    expect(overviewLayout).toContain("showModuleLauncher={!isNarrowFleetSelfServiceRole(tenant)}");
    expect(fleetLayout).toContain("showModuleLauncher={!isNarrowFleetSelfServiceRole(tenant)}");
    expect(modulesPage).toContain('if (isNarrowFleetSelfServiceRole(tenant)) redirect("/app/dashboard")');
    expect(reportsPage).toContain('if (isNarrowFleetSelfServiceRole(tenant)) redirect("/app/dashboard")');
  });

  it("classifies vehicle remittances and Work & Pay submissions as verified fleet payments", () => {
    const service = read("src/modules/fleet/service.ts");
    expect(service).toContain('submission.submissionType === "WORK_AND_PAY" ? "WORK_AND_PAY" : "WEEKLY_SALES"');
    expect(service).toContain('relatedEntity: submission.contractId ? "FleetWorkAndPayContract" : "FleetVehicle"');
    expect(service).toContain("FleetDuplicateSubmissionError");
    expect(service).toContain("FleetPaymentEvidenceError");
    expect(service).toContain("scheduledPaymentAmount");
    expect(service).toContain("driverId: vehicle.assignedDriver.id");
    expect(service).toContain("clientName: vehicle.assignedDriver.name");
    expect(service).toContain("driverId: driver.id");
    expect(service).toContain('where: { contractStatus: "ACTIVE", driver: { userId } }');
  });

  it("derives the Work & Pay client from the selected vehicle assignment", () => {
    const page = read("src/app/app/fleet/work-and-pay/page.tsx");
    const actions = read("src/app/app/fleet/work-and-pay/actions.ts");
    const migration = read("prisma/migrations/20260821213000_fleet_work_pay_driver_link/migration.sql");
    expect(page).toContain("The assigned driver is selected automatically as the Work & Pay client.");
    expect(page).not.toContain('name="clientName"');
    expect(actions).not.toContain('formData.get("clientName")');
    expect(actions).toContain("FleetDriverAssignmentError");
    expect(migration).toContain('ADD COLUMN "driverId" TEXT');
    expect(migration).toContain('vehicle."assignedDriverId"');
    expect(migration).toContain('FOREIGN KEY ("driverId") REFERENCES "FleetDriver"("id")');
  });

  it("posts a driver-submitted remittance's revenue to Accounting once it's approved, and Work & Pay deposits/instalments too", () => {
    const paymentsActions = read("src/app/app/fleet/payments/actions.ts");
    const workAndPayActions = read("src/app/app/fleet/work-and-pay/actions.ts");
    const service = read("src/modules/fleet/service.ts");
    // Driver-submission approval: the code path that creates a VERIFIED
    // fleetPayment outside the office-verified verifyPayment() flow — this
    // used to update the Fleet dashboard total without ever reaching
    // Accounting.
    expect(paymentsActions).toContain("if (approved && submission.fleetPaymentId)");
    expect(paymentsActions).toContain('sourceType: "FLEET_PAYMENT"');
    // Work & Pay deposit at contract creation and office-recorded instalments
    // are the other two silent gaps in the same class.
    expect(workAndPayActions).toContain("if (depositPayment)");
    expect(workAndPayActions).toContain("postModuleRevenue(tenant.organizationId, {");
    expect(workAndPayActions).toContain("payment.id");
    // service.ts now surfaces the created payment row on all three paths so
    // the caller (which runs after the transaction commits, since
    // postModuleRevenue can't nest inside another module's own
    // db.$transaction) has what it needs to post.
    expect(service).toContain("return { contract, depositPayment };");
    expect(service).toContain("return { contract: finalContract, payment: ledgerPayment };");
  });

  it("keeps every narrow Fleet self-service role off the organization-wide dashboard and off the subscription-status badge", () => {
    const dashboardPage = read("src/app/app/(overview)/dashboard/page.tsx");
    const appLayout = read("src/app/app/layout.tsx");
    const workspaceNavigation = read("src/platform/modules/workspace-navigation.tsx");
    expect(dashboardPage).toContain('if (isFleetDriverRole(tenant)) redirect("/app/fleet/driver-portal");');
    expect(dashboardPage).toContain('if (isMechanicRole(tenant)) redirect("/app/fleet/mechanic-portal");');
    // Vehicle Owner was missing from this redirect until Track 3 of the
    // Fleet/Accounting redesign - an external, portfolio-scoped stakeholder
    // was landing on this same unscoped organization-wide dashboard.
    expect(dashboardPage).toContain('if (isFleetOwnerRole(tenant)) redirect("/app/fleet/investor");');
    expect(appLayout).toContain("!platformIdentity && !isNarrowFleetSelfServiceRole(tenant)");
    expect(workspaceNavigation).not.toMatch(/\{ label: "Modules"[^}]*\},\s*\{ label: "Notifications"/);
  });

  it("gives the driver their own revenue trends, kept separate from the organization's", () => {
    const service = read("src/modules/fleet/service.ts");
    const driverPortal = read("src/app/app/fleet/driver-portal/page.tsx");
    expect(service).toContain("export async function getFleetDriverTrends(");
    expect(service).toContain('buildSeriesFor("FleetVehicle", vehicleIds)');
    expect(service).toContain('buildSeriesFor("FleetWorkAndPayContract", contractIds)');
    expect(driverPortal).toContain("getFleetDriverTrends");
    expect(driverPortal).toContain("trends.vehicleRevenue");
    expect(driverPortal).toContain("trends.workAndPay");
    expect(driverPortal).toContain("contract.completionPercentage");
    expect(driverPortal).toContain("Remaining");
  });

  it("accepts only a bounded image with a real supported signature", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const encoded = await fleetMaintenancePhotoData(new File([png], "fault.png", { type: "image/png" }));
    expect(encoded?.mimeType).toBe("image/png");
    expect(parseFleetMaintenancePhoto(encoded!.dataUrl)?.bytes).toEqual(Buffer.from(png));
    await expect(fleetMaintenancePhotoData(new File(["not an image"], "fault.png", { type: "image/png" }))).rejects.toThrow("invalid-maintenance-photo");
  });
});
