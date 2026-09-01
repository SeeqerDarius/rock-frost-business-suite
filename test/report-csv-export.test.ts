import { describe, expect, it } from "vitest";
import { buildReportCsv, type ReportExportInput } from "@/lib/reports/export";

const baseInput: ReportExportInput = {
  title: "Trial Balance",
  generatedAt: new Date("2026-08-31"),
  columns: [
    { key: "code", header: "Code" },
    { key: "name", header: "Account" },
    { key: "debit", header: "Debit", format: (value) => (value as number).toFixed(2) },
  ],
  rows: [{ code: "1000", name: "Cash", debit: 700 }],
};

describe("buildReportCsv", () => {
  it("renders a header row followed by one row per data row", () => {
    const csv = buildReportCsv(baseInput);

    expect(csv).toBe("Code,Account,Debit\n1000,Cash,700.00");
  });

  it("prefixes a formula-injection payload with a quote so it opens as literal text, not a live formula", () => {
    const csv = buildReportCsv({ ...baseInput, rows: [{ code: "1000", name: "=SUM(A1:A9)", debit: 0 }] });

    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).not.toMatch(/(?<!')(=SUM)/);
  });

  it("quotes a cell containing a comma or a newline and escapes embedded quotes", () => {
    const csv = buildReportCsv({ ...baseInput, rows: [{ code: "1000", name: 'Cash, "Main" branch', debit: 0 }] });

    expect(csv).toContain('"Cash, ""Main"" branch"');
  });

  it("renders the summary block above the header row when provided", () => {
    const csv = buildReportCsv({ ...baseInput, summary: [{ label: "Total debit", value: "700.00" }] });

    expect(csv.split("\n")[0]).toBe("Total debit,700.00");
    expect(csv.split("\n")[1]).toBe("");
    expect(csv.split("\n")[2]).toBe("Code,Account,Debit");
  });
});
