import { describe, expect, it } from "vitest";

import {
  MODULE_TIER_CATALOGUE,
  assertCatalogueIsMonotonic,
  featureDefinition,
  featuresIncludedAt,
  limitDefinition,
  limitsAt,
  moduleTierCatalogue,
} from "@/platform/entitlements/catalogue";
import {
  PLAN_TIERS,
  PLAN_TIER_LABELS,
  UNTIERED_LEGACY_TIER,
  isPlanTier,
  isQuoteOnlyTier,
  nextTierAbove,
  tierAtLeast,
  tierRank,
} from "@/platform/entitlements/tiers";
import { catalogueModuleKeys } from "@/platform/modules/registry";

describe("plan tier ladder", () => {
  it("is ordered, labelled, and comparable", () => {
    expect(PLAN_TIERS).toEqual(["BASIC", "PRO", "PLATINUM", "ENTERPRISE"]);
    for (const tier of PLAN_TIERS) expect(PLAN_TIER_LABELS[tier]).toBeTruthy();
    expect(tierRank("BASIC")).toBe(0);
    expect(tierRank("ENTERPRISE")).toBe(3);
  });

  it("treats a higher tier as covering every lower one", () => {
    expect(tierAtLeast("PLATINUM", "PRO")).toBe(true);
    expect(tierAtLeast("PRO", "PRO")).toBe(true);
    expect(tierAtLeast("BASIC", "PRO")).toBe(false);
    expect(tierAtLeast("ENTERPRISE", "BASIC")).toBe(true);
  });

  it("walks up the ladder and stops at the top", () => {
    expect(nextTierAbove("BASIC")).toBe("PRO");
    expect(nextTierAbove("PLATINUM")).toBe("ENTERPRISE");
    expect(nextTierAbove("ENTERPRISE")).toBeNull();
  });

  it("only sells Enterprise by quote", () => {
    expect(isQuoteOnlyTier("ENTERPRISE")).toBe(true);
    for (const tier of ["BASIC", "PRO", "PLATINUM"] as const) expect(isQuoteOnlyTier(tier)).toBe(false);
  });

  it("validates an untrusted tier string", () => {
    expect(isPlanTier("PRO")).toBe(true);
    expect(isPlanTier("pro")).toBe(false);
    expect(isPlanTier("GOLD")).toBe(false);
    expect(isPlanTier(undefined)).toBe(false);
  });

  it("grandfathers to the top non-negotiated tier, never a lower one", () => {
    // The whole point of this constant: an organization that bought before
    // tiers existed keeps everything. Lowering it silently withdraws features
    // from paying customers, so it is asserted rather than left to review.
    expect(UNTIERED_LEGACY_TIER).toBe("PLATINUM");
    expect(tierAtLeast(UNTIERED_LEGACY_TIER, "PRO")).toBe(true);
  });
});

describe("module tier catalogue", () => {
  it("never lets a higher tier include less than a lower one", () => {
    expect(() => assertCatalogueIsMonotonic()).not.toThrow();
  });

  it("covers every module the platform sells", () => {
    for (const moduleKey of catalogueModuleKeys) {
      expect(MODULE_TIER_CATALOGUE.some((entry) => entry.moduleKey === moduleKey), moduleKey).toBe(true);
    }
  });

  it("gates nothing for a module whose ladder is still pending", () => {
    // Fifteen modules ship with tieringPending so this change cannot quietly
    // take a feature away from them. If that stops being true for one of
    // them, it should be because someone defined its ladder deliberately.
    const pending = MODULE_TIER_CATALOGUE.filter((entry) => entry.tieringPending);
    expect(pending.length).toBeGreaterThan(0);
    for (const entry of pending) {
      for (const tier of PLAN_TIERS) {
        expect(featuresIncludedAt(entry.moduleKey, tier)).toEqual(entry.features.map((f) => f.key));
        for (const ceiling of Object.values(limitsAt(entry.moduleKey, tier))) expect(ceiling).toBeNull();
      }
    }
  });

  it("gives School a ladder where Basic is genuinely reduced", () => {
    const basic = featuresIncludedAt("school", "BASIC");
    const pro = featuresIncludedAt("school", "PRO");
    const platinum = featuresIncludedAt("school", "PLATINUM");

    expect(basic).toContain("school.roll");
    expect(basic).not.toContain("school.fees");
    expect(basic).not.toContain("school.exams");
    expect(basic).not.toContain("school.sms");
    expect(basic).not.toContain("school.portal");

    expect(pro).toContain("school.fees");
    expect(pro).toContain("school.exams");
    expect(pro).toContain("school.sms");
    expect(pro).not.toContain("school.portal");

    expect(platinum).toContain("school.portal");
    expect(platinum).toContain("school.payroll");

    // Cumulative, at every rung.
    expect(basic.every((key) => pro.includes(key))).toBe(true);
    expect(pro.every((key) => platinum.includes(key))).toBe(true);
  });

  it("raises School's ceilings up the ladder and never lowers them", () => {
    expect(limitsAt("school", "BASIC")["school.students"]).toBe(200);
    expect(limitsAt("school", "PRO")["school.students"]).toBe(1500);
    expect(limitsAt("school", "PLATINUM")["school.students"]).toBeNull();
    expect(limitsAt("school", "BASIC")["school.campuses"]).toBe(1);
    expect(limitsAt("school", "PLATINUM")["school.campuses"]).toBeNull();
  });

  it("declares no SMS feature for a module that still relies on the legacy grant", () => {
    // Hotel/Pharmacy/Payroll/Hospital SMS is gated today by
    // Organization.smsNotificationsGranted alone. Declaring an sms feature
    // for them before their ladder exists would make it tier-included and
    // therefore ungated, which loosens billing rather than tightening it.
    for (const moduleKey of ["hotel", "pharmacy", "payroll", "hospital"]) {
      expect(featureDefinition(`${moduleKey}.sms`), moduleKey).toBeUndefined();
      expect(featuresIncludedAt(moduleKey, "ENTERPRISE"), moduleKey).not.toContain(`${moduleKey}.sms`);
    }
    expect(featureDefinition("school.sms")?.minTier).toBe("PRO");
  });

  it("keys every declared route to a feature so nav filtering has one source", () => {
    const routed = MODULE_TIER_CATALOGUE.flatMap((entry) => entry.features.flatMap((f) => f.routes ?? []));
    expect(routed.length).toBeGreaterThan(0);
    // A route must not be claimed by two features, or two tiers would gate it.
    expect(new Set(routed).size).toBe(routed.length);
  });

  it("looks a definition up by key and fails soft for an unknown module", () => {
    expect(limitDefinition("school.students")?.unit).toBe("student");
    expect(limitDefinition("nope.nope")).toBeUndefined();
    const unknown = moduleTierCatalogue("not-a-module");
    expect(unknown.tieringPending).toBe(true);
    expect(unknown.features).toEqual([]);
  });
});
