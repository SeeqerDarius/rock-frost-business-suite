import { describe, expect, it } from "vitest";
import {
  assessContractRisk,
  ContractRuleError,
  DEFAULT_RISK_WEIGHTS,
  planBillingDates,
  resolveRiskWeights,
  resolveValueThresholds,
  riskBand,
  type RiskInput,
} from "@/modules/contracts/rules";

const now = new Date("2026-10-08T00:00:00.000Z");
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const input = (overrides: Partial<RiskInput> = {}): RiskInput => ({
  status: "ACTIVE", riskLevel: "LOW", value: "10000.00", currency: "GHS", expirationDate: d("2027-10-01"), renewalType: "MANUAL_RENEWAL", noticePeriodDays: 30,
  hasPrimaryDocument: true, hasSignature: true, missingRequiredClauses: 0, overdueObligations: 0, ...overrides,
});

describe("calculated risk", () => {
  it("scores a well-documented active contract as low with no factors", () => {
    expect(assessContractRisk(input(), DEFAULT_RISK_WEIGHTS, {}, now)).toEqual({ score: 0, band: "LOW", factors: [] });
  });

  it("adds the configured points for each factor and caps the score at 100", () => {
    const assessment = assessContractRisk(input({ riskLevel: "CRITICAL", value: "900000", missingRequiredClauses: 2, hasPrimaryDocument: false, hasSignature: false, overdueObligations: 1, expirationDate: d("2026-09-01") }), DEFAULT_RISK_WEIGHTS, { GHS: "500000" }, now);
    expect(assessment.factors.map((factor) => factor.key)).toEqual(["manualCritical", "highValue", "missingRequiredClauses", "noPrimaryDocument", "unsignedActive", "overdueObligations", "pastExpiry"]);
    expect(assessment.score).toBe(100);
    expect(assessment.band).toBe("CRITICAL");
  });

  it("compares value only against the threshold for the contract's own currency", () => {
    expect(assessContractRisk(input({ value: "900000", currency: "USD" }), DEFAULT_RISK_WEIGHTS, { GHS: "500000" }, now).factors).toEqual([]);
    expect(assessContractRisk(input({ value: "500000.00" }), DEFAULT_RISK_WEIGHTS, { GHS: "500000" }, now).factors.map((factor) => factor.key)).toEqual(["highValue"]);
  });

  it("flags expiring contracts, notice deadlines for automatic renewals, and open-ended contracts", () => {
    expect(assessContractRisk(input({ expirationDate: d("2026-10-20") }), DEFAULT_RISK_WEIGHTS, {}, now).factors.map((factor) => factor.key)).toEqual(["expiringSoon"]);
    expect(assessContractRisk(input({ expirationDate: d("2026-12-01"), renewalType: "AUTO_RENEWAL", noticePeriodDays: 40 }), DEFAULT_RISK_WEIGHTS, {}, now).factors.map((factor) => factor.key)).toEqual(["noticeDeadlineSoon"]);
    expect(assessContractRisk(input({ expirationDate: null }), DEFAULT_RISK_WEIGHTS, {}, now).factors.map((factor) => factor.key)).toEqual(["openEnded"]);
    expect(assessContractRisk(input({ expirationDate: null, renewalType: "EVERGREEN" }), DEFAULT_RISK_WEIGHTS, {}, now).factors).toEqual([]);
  });

  it("does not apply active-only factors to drafts, and scores closed contracts zero", () => {
    expect(assessContractRisk(input({ status: "DRAFT", hasPrimaryDocument: false, hasSignature: false, riskLevel: "HIGH" }), DEFAULT_RISK_WEIGHTS, {}, now).factors.map((factor) => factor.key)).toEqual(["manualHigh"]);
    expect(assessContractRisk(input({ status: "TERMINATED", riskLevel: "CRITICAL", overdueObligations: 3 }), DEFAULT_RISK_WEIGHTS, {}, now).score).toBe(0);
  });

  it("uses custom weights, and a zero weight removes the factor", () => {
    const weights = resolveRiskWeights({ overdueObligations: 50, unsignedActive: 0, bogus: 99, manualHigh: 51, expiringSoon: 2.5 });
    expect(weights.overdueObligations).toBe(50);
    expect(weights.unsignedActive).toBe(0);
    expect(weights.manualHigh).toBe(DEFAULT_RISK_WEIGHTS.manualHigh);
    expect(weights.expiringSoon).toBe(DEFAULT_RISK_WEIGHTS.expiringSoon);
    const assessment = assessContractRisk(input({ hasSignature: false, overdueObligations: 1 }), weights, {}, now);
    expect(assessment).toMatchObject({ score: 50, band: "HIGH" });
    expect(assessment.factors.map((factor) => factor.key)).toEqual(["overdueObligations"]);
  });

  it("maps scores to bands and validates thresholds", () => {
    expect([0, 19, 20, 44, 45, 69, 70, 100].map(riskBand)).toEqual(["LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "CRITICAL", "CRITICAL"]);
    expect(resolveValueThresholds({ GHS: "500000", usd: "1", EUR: 5, XAF: "1.234", KES: "250000.50" })).toEqual({ GHS: "500000", KES: "250000.50" });
    expect(resolveValueThresholds(null)).toEqual({});
  });
});

describe("billing plan dates", () => {
  it("steps from the first due date without drifting at month ends, and stops at the end date", () => {
    expect(planBillingDates(d("2026-01-31"), 1, d("2026-05-31"), 120).map((date) => date.toISOString().slice(0, 10))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(planBillingDates(d("2026-11-15"), 3, d("2027-06-01"), 120).map((date) => date.toISOString().slice(0, 10))).toEqual(["2026-11-15", "2027-02-15", "2027-05-15"]);
  });

  it("plans a fixed number of periods when there is no end date, and rejects bad frequencies", () => {
    expect(planBillingDates(d("2026-11-01"), 12, null, 3)).toHaveLength(3);
    expect(planBillingDates(d("2027-01-01"), 1, d("2026-12-31"), 12)).toEqual([]);
    expect(() => planBillingDates(d("2026-11-01"), 0, null, 3)).toThrow(ContractRuleError);
  });
});
