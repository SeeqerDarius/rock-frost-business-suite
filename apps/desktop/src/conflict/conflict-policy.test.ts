import { describe, expect, it } from "vitest";
import { getPermittedResolutionChoices, isProtectedEntityType, requiresExplicitResolution } from "@/conflict/conflict-policy";

describe("isProtectedEntityType", () => {
  it.each([
    "fleet.driver_payment",
    "installment.collection_entry",
    "installment.payment_receipt",
    "pos.offline_sale",
    "pos.offline_receipt",
    "inventory.stock_movement",
    "accounting.journal_entry",
    "payroll.run",
    "pharmacy.prescription",
    "hospital.encounter",
    "clinical.note",
  ])("flags %s as protected (never auto-resolved)", (entityType) => {
    expect(isProtectedEntityType(entityType)).toBe(true);
  });

  it.each(["fleet.maintenance_report", "fleet.inspection", "fleet.trip", "inventory.stock_count"])(
    "does not flag %s as protected",
    (entityType) => {
      expect(isProtectedEntityType(entityType)).toBe(false);
    },
  );
});

describe("requiresExplicitResolution", () => {
  it("is true for every entity type in this build — there is no auto-resolve path at all", () => {
    expect(requiresExplicitResolution("fleet", "fleet.trip")).toBe(true);
    expect(requiresExplicitResolution("pos", "pos.offline_sale")).toBe(true);
  });
});

describe("getPermittedResolutionChoices", () => {
  it("returns exactly what the server allowed, in order", () => {
    expect(getPermittedResolutionChoices({ allowedResolutions: ["keep_cloud", "manual_merge"] })).toEqual([
      "keep_cloud",
      "manual_merge",
    ]);
  });

  it("returns an empty list when the server allows nothing", () => {
    expect(getPermittedResolutionChoices({ allowedResolutions: [] })).toEqual([]);
  });

  it("drops any value outside the client's known resolution choices, rather than rendering an unrecognized action", () => {
    expect(getPermittedResolutionChoices({ allowedResolutions: ["keep_cloud", "server_side_future_choice"] })).toEqual([
      "keep_cloud",
    ]);
  });
});
