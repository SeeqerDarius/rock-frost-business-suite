import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { bracketsFromText, bracketTax, calculateEmployeeDeductions, PayrollDeductionError, type DeductionRuleInput } from "@/modules/payroll/statutory";

// Figures below are test fixtures, not statutory values.
const pct = (code: string, kind: DeductionRuleInput["kind"], rate: string, extra: Partial<DeductionRuleInput> = {}): DeductionRuleInput => ({ code, name: code, kind, method: "PERCENTAGE", rate, liabilityAccountCode: "2220", ...(kind === "EMPLOYER_CONTRIBUTION" ? { expenseAccountCode: "6100" } : {}), ...extra });
const base = { payFrequency: "MONTHLY", ytdGross: "0", ytdSubjectByCode: new Map<string, Prisma.Decimal>() };

describe("bracketTax and bracket entry", () => {
  it("applies progressive brackets on an annual amount", () => {
    const brackets = bracketsFromText("0: 10\n10000: 12\n40000: 22");
    expect(bracketTax("45000", brackets).toFixed(2)).toBe("5700.00");
    expect(bracketTax("5000", brackets).toFixed(2)).toBe("500.00");
    expect(bracketTax("-10", brackets).toFixed(2)).toBe("0.00");
  });

  it("rejects malformed schedules", () => {
    expect(() => bracketsFromText("100: 10")).toThrow(/start at 0/);
    expect(() => bracketsFromText("0: 10\n0: 12")).toThrow(/increase/);
    expect(() => bracketsFromText("0: 120")).toThrow(/between 0 and 100/);
    expect(() => bracketsFromText("zero: ten")).toThrow(PayrollDeductionError);
  });
});

describe("calculateEmployeeDeductions", () => {
  it("caps wages at an annual wage base using year-to-date subject wages", () => {
    const rules = [pct("SS", "EMPLOYEE_CONTRIBUTION", "6.2", { wageBase: "10000" })];
    const result = calculateEmployeeDeductions(rules, { ...base, grossPay: "1000", ytdSubjectByCode: new Map([["SS", new Prisma.Decimal("9500")]]) });
    expect(result.lines[0].subjectWages.toFixed(2)).toBe("500.00");
    expect(result.employeeContributions.toFixed(2)).toBe("31.00");
    const capped = calculateEmployeeDeductions(rules, { ...base, grossPay: "1000", ytdSubjectByCode: new Map([["SS", new Prisma.Decimal("10000")]]) });
    expect(capped.employeeContributions.toFixed(2)).toBe("0.00");
  });

  it("applies a rule only to year-to-date wages above an annual threshold", () => {
    const rules = [pct("ADD", "EMPLOYEE_CONTRIBUTION", "0.9", { wageFloor: "200000" })];
    expect(calculateEmployeeDeductions(rules, { ...base, grossPay: "1000", ytdGross: "199500" }).employeeContributions.toFixed(2)).toBe("4.50");
    expect(calculateEmployeeDeductions(rules, { ...base, grossPay: "1000", ytdGross: "150000" }).employeeContributions.toFixed(2)).toBe("0.00");
    expect(calculateEmployeeDeductions(rules, { ...base, grossPay: "1000", ytdGross: "250000" }).employeeContributions.toFixed(2)).toBe("9.00");
  });

  it("annualizes bracket withholding, subtracts the allowance, and adds requested extra withholding once", () => {
    const fit: DeductionRuleInput = { code: "FIT", name: "FIT", kind: "EMPLOYEE_WITHHOLDING", method: "BRACKETS", brackets: bracketsFromText("0: 10\n10000: 12\n40000: 22"), annualAllowance: "15000", liabilityAccountCode: "2210" };
    const result = calculateEmployeeDeductions([fit], { ...base, grossPay: "5000", additionalWithholding: "25" });
    expect(result.withholding.toFixed(2)).toBe("500.00"); // (60000 - 15000) -> 5700 / 12 = 475, plus 25
    expect(result.unappliedAdditionalWithholding.toFixed(2)).toBe("0.00");
    const biweekly = calculateEmployeeDeductions([fit], { ...base, payFrequency: "BIWEEKLY", grossPay: "2000" });
    expect(biweekly.withholding.toFixed(2)).toBe(new Prisma.Decimal(bracketTax("37000", fit.brackets).div(26).toFixed(2)).toFixed(2));
  });

  it("selects rules by filing status and separates employer contributions", () => {
    const rules = [
      { ...pct("FIT-S", "EMPLOYEE_WITHHOLDING", "10"), filingStatus: "SINGLE" },
      { ...pct("FIT-M", "EMPLOYEE_WITHHOLDING", "5"), filingStatus: "MARRIED_JOINTLY" },
      pct("ER", "EMPLOYER_CONTRIBUTION", "2"),
    ];
    const married = calculateEmployeeDeductions(rules, { ...base, grossPay: "1000", filingStatus: "MARRIED_JOINTLY" });
    expect(married.lines.map((line) => line.code)).toEqual(["FIT-M", "ER"]);
    expect(married.withholding.toFixed(2)).toBe("50.00");
    expect(married.employerContributions.toFixed(2)).toBe("20.00");
    expect(married.employeeContributions.toFixed(2)).toBe("0.00");
  });

  it("reports extra withholding that no rule can carry, and refuses incomplete rules", () => {
    expect(calculateEmployeeDeductions([pct("ER", "EMPLOYER_CONTRIBUTION", "2")], { ...base, grossPay: "1000", additionalWithholding: "40" }).unappliedAdditionalWithholding.toFixed(2)).toBe("40.00");
    expect(() => calculateEmployeeDeductions([pct("X", "EMPLOYEE_CONTRIBUTION", "")], { ...base, grossPay: "1000" })).toThrow(/enter the rate/);
    expect(() => calculateEmployeeDeductions([{ ...pct("ER", "EMPLOYER_CONTRIBUTION", "2"), expenseAccountCode: null }], { ...base, grossPay: "1000" })).toThrow(/expense account/);
    expect(() => calculateEmployeeDeductions([pct("X", "EMPLOYEE_CONTRIBUTION", "1")], { ...base, payFrequency: "DAILY", grossPay: "1000" })).toThrow(/pay frequency/);
  });
});
