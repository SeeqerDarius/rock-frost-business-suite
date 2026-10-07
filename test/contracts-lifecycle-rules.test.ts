import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  addMonths,
  approvalRuleMatches,
  buildCalendarEvents,
  ContractRuleError,
  isStepApprover,
  nextOccurrence,
  noticeDeadline,
  noticeShortfallDays,
  parseAmendmentChanges,
  reminderBand,
  selectApprovalRule,
  type ApprovalRuleShape,
  type ApprovalSubjectShape,
} from "@/modules/contracts/rules";

const rule = (overrides: Partial<ApprovalRuleShape> = {}): ApprovalRuleShape => ({
  id: "r1", name: "Rule", priority: 100, active: true, minValue: null, currency: null, categoryId: null, typeId: null, department: null, minRiskLevel: null, jurisdiction: null, branchId: null, ...overrides,
});
const contract = (overrides: Partial<ApprovalSubjectShape> = {}): ApprovalSubjectShape => ({
  value: new Prisma.Decimal("50000.00"), currency: "GHS", categoryId: "cat-supplier", typeId: null, department: "Procurement", riskLevel: "MEDIUM", governingJurisdiction: "Ghana", branchId: null, ...overrides,
});
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("approval rule matching", () => {
  it("matches value thresholds only in the rule's own currency", () => {
    const highValue = rule({ minValue: "10000", currency: "GHS" });
    expect(approvalRuleMatches(highValue, contract())).toBe(true);
    expect(approvalRuleMatches(highValue, contract({ value: "9999.99" }))).toBe(false);
    expect(approvalRuleMatches(highValue, contract({ value: "10000.00" }))).toBe(true);
    // A USD contract is never compared with a GHS threshold.
    expect(approvalRuleMatches(highValue, contract({ currency: "USD", value: "999999" }))).toBe(false);
    expect(approvalRuleMatches(highValue, contract({ value: null }))).toBe(false);
  });

  it("requires every condition and treats text conditions case-insensitively", () => {
    expect(approvalRuleMatches(rule({ categoryId: "cat-supplier", department: "procurement", jurisdiction: "GHANA" }), contract())).toBe(true);
    expect(approvalRuleMatches(rule({ categoryId: "cat-customer" }), contract())).toBe(false);
    expect(approvalRuleMatches(rule({ department: "Finance" }), contract({ department: null }))).toBe(false);
    expect(approvalRuleMatches(rule({ minRiskLevel: "HIGH" }), contract({ riskLevel: "MEDIUM" }))).toBe(false);
    expect(approvalRuleMatches(rule({ minRiskLevel: "HIGH" }), contract({ riskLevel: "CRITICAL" }))).toBe(true);
    expect(approvalRuleMatches(rule({ active: false }), contract())).toBe(false);
    expect(approvalRuleMatches(rule(), contract())).toBe(true);
  });

  it("selects the first matching rule by priority, then name", () => {
    const rules = [rule({ id: "a", name: "Catch-all", priority: 500 }), rule({ id: "b", name: "Critical", priority: 10, minRiskLevel: "CRITICAL" }), rule({ id: "c", name: "Suppliers", priority: 50, categoryId: "cat-supplier" })];
    expect(selectApprovalRule(rules, contract())?.id).toBe("c");
    expect(selectApprovalRule(rules, contract({ riskLevel: "CRITICAL" }))?.id).toBe("b");
    expect(selectApprovalRule(rules, contract({ categoryId: null }))?.id).toBe("a");
    expect(selectApprovalRule([], contract())).toBeNull();
  });

  it("recognizes approvers directly or through their role", () => {
    expect(isStepApprover({ approverUserId: "u1", approverRoleId: null }, { userId: "u1", roleId: null })).toBe(true);
    expect(isStepApprover({ approverUserId: null, approverRoleId: "legal" }, { userId: "u2", roleId: "legal" })).toBe(true);
    expect(isStepApprover({ approverUserId: null, approverRoleId: "legal" }, { userId: "u2", roleId: null })).toBe(false);
    expect(isStepApprover({ approverUserId: "u1", approverRoleId: null }, { userId: "u2", roleId: "u1" })).toBe(false);
  });
});

describe("dates, recurrence, and notice", () => {
  it("adds months and clamps to the end of shorter months", () => {
    expect(addMonths(d("2026-01-31"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(d("2028-01-31"), 1).toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(addMonths(d("2026-11-15"), 3).toISOString().slice(0, 10)).toBe("2027-02-15");
    expect(nextOccurrence(d("2026-03-31"), "QUARTERLY")?.toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(nextOccurrence(d("2026-03-31"), "NONE")).toBeNull();
  });

  it("computes notice deadlines and shortfalls", () => {
    expect(noticeDeadline(d("2027-01-31"), 30)?.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(noticeDeadline(d("2027-01-31"), null)).toBeNull();
    expect(noticeShortfallDays(d("2026-10-01"), d("2026-10-31"), 30)).toBe(0);
    expect(noticeShortfallDays(d("2026-10-01"), d("2026-10-21"), 30)).toBe(10);
    expect(noticeShortfallDays(d("2026-10-01"), d("2026-10-02"), null)).toBe(0);
  });

  it("puts a due date in one reminder band at a time", () => {
    const thresholds = [90, 60, 30, 7];
    expect(reminderBand(120, thresholds)).toBeNull();
    expect(reminderBand(90, thresholds)).toBe(90);
    expect(reminderBand(45, thresholds)).toBe(60);
    expect(reminderBand(7, thresholds)).toBe(7);
    expect(reminderBand(0, thresholds)).toBe(7);
    expect(reminderBand(0, [14, 7, 0])).toBe(0);
    expect(reminderBand(-1, thresholds)).toBe(-1);
  });
});

describe("amendment changes", () => {
  it("keeps only the terms that change and normalizes them", () => {
    expect(parseAmendmentChanges({ title: "", value: "150000.5", currency: "usd", expirationDate: "2027-12-31", noticePeriodDays: "60", renewalType: "AUTO_RENEWAL" })).toEqual({
      value: "150000.5", currency: "USD", expirationDate: "2027-12-31", noticePeriodDays: 60, renewalType: "AUTO_RENEWAL",
    });
  });

  it("rejects invalid values and empty amendments", () => {
    expect(() => parseAmendmentChanges({})).toThrow(ContractRuleError);
    expect(() => parseAmendmentChanges({ value: "-5" })).toThrow(ContractRuleError);
    expect(() => parseAmendmentChanges({ value: "1.234" })).toThrow(ContractRuleError);
    expect(() => parseAmendmentChanges({ expirationDate: "31/12/2027" })).toThrow(ContractRuleError);
    expect(() => parseAmendmentChanges({ renewalTermMonths: "0" })).toThrow(ContractRuleError);
    expect(() => parseAmendmentChanges({ renewalType: "FOREVER" })).toThrow(ContractRuleError);
  });
});

describe("calendar events", () => {
  it("lists expirations, notice deadlines, open obligations, and planned milestones inside the window", () => {
    const events = buildCalendarEvents({
      contracts: [
        { id: "c1", contractNumber: "CTR/1", title: "Lease", status: "ACTIVE", expirationDate: d("2026-11-30"), renewalDate: null, noticePeriodDays: 20 },
        { id: "c2", contractNumber: "CTR/2", title: "Draft", status: "DRAFT", expirationDate: d("2026-11-15"), renewalDate: null, noticePeriodDays: null },
      ],
      obligations: [
        { contractId: "c1", contractNumber: "CTR/1", title: "Insurance certificate", dueDate: d("2026-11-05"), status: "OPEN" },
        { contractId: "c1", contractNumber: "CTR/1", title: "Done already", dueDate: d("2026-11-06"), status: "COMPLETED" },
      ],
      milestones: [{ contractId: "c1", contractNumber: "CTR/1", title: "Handover", dueDate: d("2026-11-20"), status: "PLANNED" }],
    }, d("2026-11-01"), d("2026-12-01"), d("2026-11-07"));
    expect(events.map((event) => [event.kind, event.date.toISOString().slice(0, 10), event.overdue])).toEqual([
      ["OBLIGATION", "2026-11-05", true],
      ["NOTICE_DEADLINE", "2026-11-10", false],
      ["MILESTONE", "2026-11-20", false],
      ["EXPIRATION", "2026-11-30", false],
    ]);
  });
});
