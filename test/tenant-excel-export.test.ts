import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildTenantExcelWorkbook } from "@/lib/backup/tenant-excel";

describe("tenant Excel export", () => {
  it("creates a readable workbook and neutralizes spreadsheet formulas", async () => {
    const buffer = await buildTenantExcelWorkbook({ tenantCode: "SCHOOL-01", scope: "school", includedModules: ["school"], generatedAt: new Date("2026-08-11T12:00:00.000Z"), models: {
      SchoolStudent: [{ id: "student-1", organizationId: "org-1", fullName: "=HYPERLINK(\"https://example.invalid\")", active: true, enrolledAt: new Date("2026-01-02T09:30:00.000Z") }],
    } });
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Export Summary", "SchoolStudent"]);
    expect(workbook.getWorksheet("Export Summary")?.getCell("B1").value).toContain("not a restorable system backup");
    const sheet = workbook.getWorksheet("SchoolStudent");
    const values = sheet?.getRow(1).values;
    const nameColumn = Array.isArray(values) ? values.findIndex((value) => value === "fullName") : -1;
    expect(sheet?.getCell(2, nameColumn).value).toBe("'=HYPERLINK(\"https://example.invalid\")");
    expect(sheet?.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet?.autoFilter).toBeTruthy();
  });
});
