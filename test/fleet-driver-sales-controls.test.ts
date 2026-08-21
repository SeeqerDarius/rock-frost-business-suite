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
    const layout = read("src/app/app/fleet/layout.tsx");
    const overview = read("src/app/app/fleet/page.tsx");
    expect(layout).toContain('["/app/fleet/driver-portal", hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)]');
    expect(layout).toContain("PERMISSIONS.FLEET_DRIVER_SELF_SERVICE");
    expect(overview).toContain('redirect("/app/fleet/driver-portal")');
  });

  it("classifies vehicle remittances and Work & Pay submissions as verified fleet payments", () => {
    const service = read("src/modules/fleet/service.ts");
    expect(service).toContain('submission.submissionType === "WORK_AND_PAY" ? "WORK_AND_PAY" : "WEEKLY_SALES"');
    expect(service).toContain('relatedEntity: submission.contractId ? "FleetWorkAndPayContract" : "FleetVehicle"');
    expect(service).toContain("FleetDuplicateSubmissionError");
    expect(service).toContain("FleetPaymentEvidenceError");
    expect(service).toContain("scheduledPaymentAmount");
  });

  it("accepts only a bounded image with a real supported signature", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const encoded = await fleetMaintenancePhotoData(new File([png], "fault.png", { type: "image/png" }));
    expect(encoded?.mimeType).toBe("image/png");
    expect(parseFleetMaintenancePhoto(encoded!.dataUrl)?.bytes).toEqual(Buffer.from(png));
    await expect(fleetMaintenancePhotoData(new File(["not an image"], "fault.png", { type: "image/png" }))).rejects.toThrow("invalid-maintenance-photo");
  });
});
