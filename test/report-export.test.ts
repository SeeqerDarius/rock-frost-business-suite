import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildReportExcelWorkbook, buildReportPdf, type ReportExportInput } from "@/lib/reports/export";
import { summaryToReportInput } from "@/lib/reports/summary-to-report";

const SAMPLE_INPUT: ReportExportInput = {
  title: "Accounting report",
  subtitle: "Acme Ltd",
  generatedAt: new Date("2026-08-20T12:00:00.000Z"),
  summary: [{ label: "Total revenue", value: "1,000.00" }],
  columns: [
    { key: "name", header: "Vendor", width: 2 },
    { key: "amount", header: "Amount", width: 1, align: "right" },
  ],
  rows: [
    { name: "=HYPERLINK(\"https://example.invalid\")", amount: 50 },
    { name: "Widgets Co", amount: 125.5 },
  ],
};

describe("buildReportExcelWorkbook", () => {
  it("produces a readable workbook with a formula-neutralized cell and a styled header row", async () => {
    const buffer = await buildReportExcelWorkbook(SAMPLE_INPUT);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(1, 1).value).toBe("Accounting report");
    // Row 2 subtitle, row 3 "Generated ...", row 4 blank, row 5 summary stat, row 6 blank, row 7 header.
    expect(sheet.getCell(5, 1).value).toBe("Total revenue");
    expect(sheet.getCell(5, 2).value).toBe("1,000.00");
    const headerRow = 7;
    expect(sheet.getCell(headerRow, 1).value).toBe("Vendor");
    expect(sheet.getCell(headerRow, 1).font).toMatchObject({ bold: true });
    expect(sheet.getCell(headerRow + 1, 1).value).toBe("'=HYPERLINK(\"https://example.invalid\")");
    expect(sheet.getCell(headerRow + 2, 1).value).toBe("Widgets Co");
  });

  it("writes a placeholder row instead of an empty table when there are no rows", async () => {
    const buffer = await buildReportExcelWorkbook({ ...SAMPLE_INPUT, rows: [], summary: undefined });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    // Row 1 title, row 2 subtitle, row 3 "Generated ...", row 4 blank, row 5 header, row 6 "No records".
    expect(sheet.getCell(5, 1).value).toBe("Vendor");
    expect(sheet.getCell(6, 1).value).toBe("No records");
  });
});

describe("buildReportPdf", () => {
  it("produces a valid, non-empty PDF buffer", async () => {
    const buffer = await buildReportPdf(SAMPLE_INPUT);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("paginates a large row set without throwing", async () => {
    const manyRows = Array.from({ length: 200 }, (_, index) => ({ name: `Row ${index}`, amount: index }));
    const buffer = await buildReportPdf({ ...SAMPLE_INPUT, rows: manyRows });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a placeholder for zero rows instead of an empty table", async () => {
    const buffer = await buildReportPdf({ ...SAMPLE_INPUT, rows: [] });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("summaryToReportInput", () => {
  it("flattens a flat summary object into Metric/Value rows with humanized labels", () => {
    const input = summaryToReportInput({
      title: "HR report",
      generatedAt: new Date("2026-08-20T00:00:00.000Z"),
      summary: { totalEmployees: 12, activeEmployeeCount: 10 },
    });
    expect(input.rows).toEqual([
      { metric: "Total employees", value: "12" },
      { metric: "Active employee count", value: "10" },
    ]);
  });

  it("flattens a nested breakdown object using a colon separator, never an em dash", () => {
    const input = summaryToReportInput({
      title: "HR report",
      generatedAt: new Date("2026-08-20T00:00:00.000Z"),
      summary: { departmentCounts: { Engineering: 5, Sales: 3 } },
    });
    expect(input.rows).toEqual([
      { metric: "Department counts: Engineering", value: "5" },
      { metric: "Department counts: Sales", value: "3" },
    ]);
    expect(JSON.stringify(input.rows)).not.toContain("—");
  });

  it("reduces an array value to its count rather than dumping raw records", () => {
    const input = summaryToReportInput({
      title: "Inventory report",
      generatedAt: new Date("2026-08-20T00:00:00.000Z"),
      summary: { lowStockItems: [{ id: "1" }, { id: "2" }, { id: "3" }] },
    });
    expect(input.rows).toEqual([{ metric: "Low stock items", value: "3" }]);
  });

  it("formats money-like decimals to two places and leaves whole numbers unformatted", () => {
    const input = summaryToReportInput({
      title: "POS report",
      generatedAt: new Date("2026-08-20T00:00:00.000Z"),
      summary: { todaysSalesTotal: 1234.5, todaysSalesCount: 7 },
    });
    expect(input.rows).toEqual([
      { metric: "Todays sales total", value: "1,234.50" },
      { metric: "Todays sales count", value: "7" },
    ]);
  });
});
