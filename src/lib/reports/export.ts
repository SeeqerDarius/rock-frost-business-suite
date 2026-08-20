import "server-only";

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { safeExcelText, safeExcelValue } from "@/lib/excel-safety";

export interface ReportColumn {
  key: string;
  header: string;
  /** Relative width weight (not points/pixels) — a column with weight 2 is twice as wide as one with weight 1. Defaults to 1. */
  width?: number;
  align?: "left" | "right" | "center";
  /** Rendered text for both PDF and the Excel fallback text; a numeric/date value is still written natively to Excel when this is omitted. */
  format?: (value: unknown) => string;
}

export interface ReportSummaryStat {
  label: string;
  value: string;
}

export interface ReportExportInput {
  title: string;
  /** Organization name — shown under the title on both formats. */
  subtitle?: string;
  generatedAt: Date;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  /** Key figures shown above the table (e.g. "Total revenue: 12,000.00") — the same numbers a Reports page's summary cards already show. */
  summary?: ReportSummaryStat[];
}

function defaultCellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

const BRAND_COLOR_ARGB = "FF1266D4";
const BRAND_COLOR_HEX = "#1266D4";

/**
 * One sheet: a small key/value summary block (when provided) above the
 * data table. Reuses the same formula-injection guard
 * (safeExcelText/safeExcelValue) the tenant data-export workbook already
 * relies on — a report can include user-entered free text (invoice
 * descriptions, notes) that must never be interpreted as a live formula
 * when the file is opened.
 */
export async function buildReportExcelWorkbook(input: ReportExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rock Frost Business Suite";
  workbook.created = input.generatedAt;
  workbook.modified = input.generatedAt;
  workbook.title = input.title;

  const sheet = workbook.addWorksheet(input.title.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Report", {
    views: [{ state: "frozen", ySplit: (input.summary?.length ?? 0) > 0 ? input.summary!.length + 2 : 1 }],
  });

  let row = 1;
  sheet.getCell(row, 1).value = safeExcelText(input.title);
  sheet.getCell(row, 1).font = { bold: true, size: 14 };
  row += 1;
  if (input.subtitle) {
    sheet.getCell(row, 1).value = safeExcelText(input.subtitle);
    row += 1;
  }
  sheet.getCell(row, 1).value = `Generated ${input.generatedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`;
  sheet.getCell(row, 1).font = { italic: true, color: { argb: "FF888888" } };
  row += 2;

  if (input.summary?.length) {
    for (const stat of input.summary) {
      sheet.getCell(row, 1).value = safeExcelText(stat.label);
      sheet.getCell(row, 1).font = { bold: true };
      sheet.getCell(row, 2).value = safeExcelText(stat.value);
      row += 1;
    }
    row += 1;
  }

  const headerRowIndex = row;
  input.columns.forEach((column, index) => {
    const cell = sheet.getCell(headerRowIndex, index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_COLOR_ARGB } };
  });
  sheet.autoFilter = { from: { row: headerRowIndex, column: 1 }, to: { row: headerRowIndex, column: input.columns.length } };
  row += 1;

  if (input.rows.length === 0) {
    sheet.getCell(row, 1).value = "No records";
  }
  for (const dataRow of input.rows) {
    input.columns.forEach((column, index) => {
      const raw = dataRow[column.key];
      sheet.getCell(row, index + 1).value = column.format ? safeExcelText(column.format(raw)) : safeExcelValue(raw);
    });
    row += 1;
  }

  input.columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.min(42, Math.max(14, column.header.length + 2, (column.width ?? 1) * 14));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Auto-paginating tabular PDF using pdfkit's built-in standard-14 fonts
 * (Helvetica) — deliberately avoids any custom TTF embedding, which is a
 * frequent source of "font file not found" failures once a Next.js app is
 * bundled for Vercel's serverless functions.
 */
export function buildReportPdf(input: ReportExportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000").text(input.title);
    if (input.subtitle) doc.font("Helvetica").fontSize(11).fillColor("#555555").text(input.subtitle);
    doc.font("Helvetica").fontSize(8).fillColor("#888888").text(`Generated ${input.generatedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`);
    doc.moveDown();

    if (input.summary?.length) {
      doc.fontSize(9);
      for (const stat of input.summary) {
        doc.font("Helvetica-Bold").fillColor("#000000").text(`${stat.label}: `, { continued: true });
        doc.font("Helvetica").text(stat.value);
      }
      doc.moveDown();
    }

    const startX = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const totalWeight = input.columns.reduce((sum, column) => sum + (column.width ?? 1), 0);
    const columnWidths = input.columns.map((column) => (usableWidth * (column.width ?? 1)) / totalWeight);
    const rowHeight = 16;

    function drawRow(y: number, values: string[], options: { header?: boolean }) {
      let x = startX;
      if (options.header) {
        doc.rect(startX, y - 3, usableWidth, rowHeight).fill(BRAND_COLOR_HEX);
        doc.fillColor("#FFFFFF").font("Helvetica-Bold");
      } else {
        doc.fillColor("#000000").font("Helvetica");
      }
      doc.fontSize(8);
      values.forEach((value, index) => {
        doc.text(value, x + 3, y, { width: columnWidths[index] - 6, align: input.columns[index]?.align ?? "left", lineBreak: false, ellipsis: true });
        x += columnWidths[index];
      });
    }

    function ensureRoomFor(y: number, needed: number) {
      if (y + needed <= doc.page.height - doc.page.margins.bottom) return y;
      doc.addPage();
      const headerY = doc.page.margins.top;
      drawRow(headerY, input.columns.map((column) => column.header), { header: true });
      return headerY + rowHeight;
    }

    let y = doc.y;
    drawRow(y, input.columns.map((column) => column.header), { header: true });
    y += rowHeight;

    if (input.rows.length === 0) {
      y = ensureRoomFor(y, rowHeight);
      doc.fillColor("#666666").font("Helvetica").fontSize(9).text("No records", startX, y);
    }
    for (const dataRow of input.rows) {
      y = ensureRoomFor(y, rowHeight);
      const values = input.columns.map((column) => {
        const raw = dataRow[column.key];
        return column.format ? column.format(raw) : defaultCellText(raw);
      });
      drawRow(y, values, {});
      y += rowHeight;
    }

    doc.end();
  });
}
