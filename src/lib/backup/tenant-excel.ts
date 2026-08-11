import "server-only";

import ExcelJS from "exceljs";
import type { BackupModule } from "@/lib/backup/scopes";

type TenantExcelInput = {
  tenantCode: string;
  scope: BackupModule | "all";
  includedModules: readonly BackupModule[];
  generatedAt: Date;
  models: Record<string, Record<string, unknown>[]>;
};

const EXCEL_MAX_ROWS = 1_048_575;

function safeText(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function excelValue(value: unknown): ExcelJS.CellValue {
  if (value == null) return "";
  if (value instanceof Date) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return safeText(value);
  return safeText(JSON.stringify(value));
}

function sheetName(modelName: string, used: Set<string>) {
  const base = modelName.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Data";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const marker = ` ${suffix++}`;
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
  }
  used.add(candidate);
  return candidate;
}

function orderedColumns(rows: Record<string, unknown>[]) {
  const names = new Set<string>();
  for (const row of rows) Object.keys(row).forEach((name) => names.add(name));
  return [...names].sort((left, right) => {
    const priority = (name: string) => name === "id" ? 0 : name === "organizationId" ? 1 : 2;
    return priority(left) - priority(right) || left.localeCompare(right);
  });
}

export async function buildTenantExcelWorkbook(input: TenantExcelInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rock Frost Business Suite";
  workbook.company = "Rock Frost";
  workbook.created = input.generatedAt;
  workbook.modified = input.generatedAt;
  workbook.subject = `Tenant module export for ${input.tenantCode}`;
  workbook.title = `Rock Frost ${input.tenantCode} data export`;

  const summary = workbook.addWorksheet("Export Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  summary.columns = [{ width: 24 }, { width: 72 }];
  summary.addRows([
    ["Rock Frost data export", "Customer-readable Excel export (not a restorable system backup)"],
    ["Organization code", safeText(input.tenantCode)],
    ["Generated at (UTC)", input.generatedAt],
    ["Scope", input.scope === "all" ? "All active modules" : input.scope],
    ["Included modules", input.includedModules.join(", ")],
    ["Security boundary", "Only data for the selected active modules and current organization is included."],
    ["Restore guidance", "Use the JSON system backup from Rock Frost when a restore is required."],
  ]);
  summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1266D4" } };
  summary.getColumn(1).font = { bold: true };
  summary.getCell("B3").numFmt = "yyyy-mm-dd hh:mm:ss";

  const used = new Set(["Export Summary"]);
  for (const [modelName, allRows] of Object.entries(input.models).sort(([left], [right]) => left.localeCompare(right))) {
    if (allRows.length > EXCEL_MAX_ROWS) throw new Error(`${modelName} exceeds the Excel worksheet row limit.`);
    const worksheet = workbook.addWorksheet(sheetName(modelName, used), {
      views: [{ state: "frozen", ySplit: 1 }],
      properties: { defaultRowHeight: 18 },
    });
    const columns = orderedColumns(allRows);
    if (!columns.length) {
      worksheet.addRow(["No records"]);
      continue;
    }
    worksheet.columns = columns.map((key) => ({ header: key, key, width: Math.min(42, Math.max(14, key.length + 2)) }));
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1266D4" } };
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    for (const row of allRows) worksheet.addRow(Object.fromEntries(columns.map((column) => [column, excelValue(row[column])])));
    columns.forEach((column, index) => {
      const sample = allRows.find((row) => row[column] instanceof Date)?.[column];
      if (sample instanceof Date) worksheet.getColumn(index + 1).numFmt = "yyyy-mm-dd hh:mm:ss";
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
