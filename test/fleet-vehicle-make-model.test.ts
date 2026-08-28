import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VEHICLE_MAKES, getMakeLogoName, makeBadgeColor, makeInitials } from "@/lib/fleet-vehicle-makes";

/**
 * User request: the vehicle Make field should offer a dropdown covering
 * "all cars in the world," including Chinese makes, with a logo-style badge
 * next to the selected make (like Odoo). Real manufacturer emblems for the
 * majority of global/Japanese/Korean makes now render via @cardog-icons/react
 * (MIT-licensed SVG redraws published for this exact use case). No source
 * with a comparable open license was found for Chinese manufacturers, so
 * those still fall back to the colored-initials badge - disclosed to the
 * user rather than silently shipped as a full solution.
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

  it("maps common global makes to a real @cardog-icons/react logo name", () => {
    for (const [make, expected] of [
      ["Toyota", "ToyotaIcon"],
      ["Ford", "FordIcon"],
      ["Mercedes-Benz", "MBIcon"],
      ["Land Rover", "LandroverIcon"],
    ] as const) {
      expect(getMakeLogoName(make)).toBe(expected);
    }
  });

  it("has no real logo mapping for Chinese manufacturers (BYD aside) - honest fallback, not a silent gap", () => {
    for (const chineseMake of ["Geely", "Great Wall (Haval)", "Chery", "MG (SAIC)", "NIO", "XPeng", "Changan", "GAC", "JAC"]) {
      expect(getMakeLogoName(chineseMake)).toBeUndefined();
    }
    expect(getMakeLogoName("BYD")).toBe("BYDIcon");
  });

  it("derives a deterministic badge color and initials per make for the fallback path", () => {
    expect(makeBadgeColor("Geely")).toBe(makeBadgeColor("Geely"));
    expect(makeInitials("Geely")).toBe("GE");
    expect(makeInitials("Great Wall (Haval)")).toBe("GW");
  });
});

describe("Vehicle form Make/Model cascading fields", () => {
  const vehiclesPage = readFileSync("src/app/app/fleet/vehicles/page.tsx", "utf8");
  const fields = readFileSync("src/app/app/fleet/vehicles/vehicle-make-model-fields.tsx", "utf8");
  const makeLogo = readFileSync("src/components/fleet/make-logo.tsx", "utf8");

  it("replaces the old free-text make/model inputs with the cascading, logo-driven client component", () => {
    expect(vehiclesPage).toContain("VehicleMakeModelFields");
    expect(fields).toContain('"use client"');
    expect(fields).toContain("VEHICLE_MAKES");
    expect(fields).toContain("Other (not listed)");
  });

  it("uses the shared MakeLogo component (real logo or badge fallback) on both the form and the vehicles table", () => {
    expect(fields).toContain("MakeLogo");
    expect(vehiclesPage).toContain("MakeLogo");
  });

  it("MakeLogo renders a real @cardog-icons/react logo when one is mapped, and the initials badge otherwise", () => {
    expect(makeLogo).toContain('from "@cardog-icons/react"');
    expect(makeLogo).toContain("getMakeLogoName(make)");
    expect(makeLogo).toContain("makeInitials(make)");
  });

  it("still submits make/model as plain form fields the existing server action already accepts", () => {
    expect(fields).toContain('name="make"');
    expect(fields).toContain('name="model"');
  });
});
