import "server-only";

import type ExcelJS from "exceljs";

/** Prefixes a leading =, +, -, or @ with a quote so Excel/Sheets treats the value as literal text instead of evaluating it as a formula when the workbook is opened — the standard CSV/XLSX formula-injection guard. */
export function safeExcelText(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** Coerces an arbitrary JS value into something safe to hand to ExcelJS as a cell value, applying safeExcelText to every string (including stringified fallbacks). */
export function safeExcelValue(value: unknown): ExcelJS.CellValue {
  if (value == null) return "";
  if (value instanceof Date) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return safeExcelText(value);
  return safeExcelText(JSON.stringify(value));
}
