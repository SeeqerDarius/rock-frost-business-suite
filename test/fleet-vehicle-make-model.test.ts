import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VEHICLE_MAKES, makeBadgeColor, makeInitials } from "@/lib/fleet-vehicle-makes";

/**
 * User request: the vehicle Make field should offer a dropdown covering
 * "all cars in the world," including Chinese makes, with a logo-style badge
 * next to the selected make (like Odoo) - plus an escape hatch for makes not
 * listed. Real manufacturer logo marks are trademarked and not available to
 * bundle here, so the badge is a deterministic colored-initials placeholder
 * instead of a real logo image (disclosed to the user).
 */
describe("Fleet vehicle make/model reference data", () => {
  it("covers a broad set of global makes plus major Chinese manufacturers", () => {
    const names = VEHICLE_MAKES.map((entry) => entry.name);
    expect(names.length).toBeGreaterThan(40);
    for (const chineseMake of ["BYD", "Geely", "Great Wall (Haval)", "Chery", "MG (SAIC)", "NIO", "XPeng", "Changan", "GAC", "JAC"]) {
      expect(names).toContain(chineseMake);
    }
    for (const globalMake of ["Toyota", "Ford", "Volkswagen", "Mercedes-Benz", "Honda", "Nissan"]) {
      expect(names).toContain(globalMake);
    }
  });

  it("gives every make a non-empty model list", () => {
    for (const entry of VEHICLE_MAKES) {
      expect(entry.models.length).toBeGreaterThan(0);
    }
  });

  it("derives a deterministic badge color and initials per make", () => {
    expect(makeBadgeColor("Toyota")).toBe(makeBadgeColor("Toyota"));
    expect(makeInitials("Toyota")).toBe("TO");
    expect(makeInitials("Great Wall (Haval)")).toBe("GW");
  });
});

describe("Vehicle form Make/Model cascading fields", () => {
  const vehiclesPage = readFileSync("src/app/app/fleet/vehicles/page.tsx", "utf8");
  const fields = readFileSync("src/app/app/fleet/vehicles/vehicle-make-model-fields.tsx", "utf8");

  it("replaces the old free-text make/model inputs with the cascading, badge-driven client component", () => {
    expect(vehiclesPage).toContain("VehicleMakeModelFields");
    expect(fields).toContain('"use client"');
    expect(fields).toContain("VEHICLE_MAKES");
    expect(fields).toContain("Other (not listed)");
  });

  it("still submits make/model as plain form fields the existing server action already accepts", () => {
    expect(fields).toContain('name="make"');
    expect(fields).toContain('name="model"');
  });
});
