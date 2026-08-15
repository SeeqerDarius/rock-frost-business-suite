import { describe, expect, it } from "vitest";
import { getPermittedResolutionChoices, isProtectedEntityType, requiresExplicitResolution } from "@/conflict/conflict-policy";

describe("conflict policy", () => {
  it.each(["fleet.driver_payment_submission", "installment.payment", "inventory.movement", "pos.sale"])("protects supported sensitive type %s", (entityType) => expect(isProtectedEntityType(entityType)).toBe(true));
  it("requires explicit resolution", () => expect(requiresExplicitResolution("fleet", "fleet.maintenance_request")).toBe(true));
  it("offers only the server-supported KEEP_CLOUD choice", () => expect(getPermittedResolutionChoices({ allowedResolutions: ["KEEP_CLOUD", "UNSUPPORTED"] })).toEqual(["KEEP_CLOUD"]));
});
