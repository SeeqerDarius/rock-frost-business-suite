import "server-only";

import PDFDocument from "pdfkit";
import { formatMoney } from "@/lib/currency";

export interface PrintableDocumentLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PrintableDocumentInput {
  documentType: "INVOICE" | "BILL" | "RECEIPT";
  documentNumber: string;
  documentDate: Date;
  dueDate?: Date | null;
  organization: { name: string; address?: string | null; taxNumber?: string | null; phone?: string | null; email?: string | null };
  counterpartyLabel: string;
  counterpartyName: string;
  counterpartyEmail?: string | null;
  counterpartyTin?: string | null;
  currency: string;
  lines: PrintableDocumentLine[];
  taxableAmount: number;
  vatAmount: number;
  nhilAmount: number;
  getfundAmount: number;
  amount: number;
  amountPaid?: number;
  notes?: string | null;
}

/** DD/MM/YYYY, the Ghana-conventional date format, distinct from every other
 * report in this app (which use the browser's locale date rendering). */
function formatGhanaDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

const TITLES: Record<PrintableDocumentInput["documentType"], string> = { INVOICE: "TAX INVOICE", BILL: "BILL", RECEIPT: "RECEIPT" };

/**
 * A document-style printable (not a tabular report - see buildReportPdf for
 * that): company letterhead block, counterparty block, a line-item table,
 * and a Ghana-conventional VAT/NHIL/GETFund breakdown. Shares pdfkit's
 * standard-14-font-only convention with buildReportPdf, for the same reason
 * (no bundled TTF to go missing on Vercel's serverless functions).
 */
export function buildPrintableDocumentPdf(input: PrintableDocumentInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const money = (value: number) => formatMoney(value, input.currency);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const usableWidth = right - left;

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#000000").text(input.organization.name, left, doc.y);
    doc.font("Helvetica").fontSize(9).fillColor("#555555");
    if (input.organization.address) doc.text(input.organization.address);
    const orgContactLine = [input.organization.phone, input.organization.email].filter(Boolean).join(" · ");
    if (orgContactLine) doc.text(orgContactLine);
    if (input.organization.taxNumber) doc.text(`TIN: ${input.organization.taxNumber}`);

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#000000").text(TITLES[input.documentType], left, 50, { width: usableWidth, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#555555");
    doc.text(`No: ${input.documentNumber}`, { width: usableWidth, align: "right" });
    doc.text(`Date: ${formatGhanaDate(input.documentDate)}`, { width: usableWidth, align: "right" });
    if (input.dueDate) doc.text(`Due: ${formatGhanaDate(input.dueDate)}`, { width: usableWidth, align: "right" });

    doc.moveDown(2);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text(input.counterpartyLabel, left);
    doc.font("Helvetica").fontSize(10).text(input.counterpartyName);
    doc.fontSize(9).fillColor("#555555");
    if (input.counterpartyEmail) doc.text(input.counterpartyEmail);
    if (input.counterpartyTin) doc.text(`TIN: ${input.counterpartyTin}`);

    doc.moveDown(1.5);
    const columns = [
      { header: "Description", width: 0.5, align: "left" as const },
      { header: "Qty", width: 0.12, align: "right" as const },
      { header: "Unit price", width: 0.19, align: "right" as const },
      { header: "Amount", width: 0.19, align: "right" as const },
    ];
    const columnWidths = columns.map((column) => usableWidth * column.width);
    const rowHeight = 18;

    function drawLineRow(y: number, values: string[], header: boolean) {
      let x = left;
      if (header) {
        doc.rect(left, y - 3, usableWidth, rowHeight).fill("#1266D4");
        doc.fillColor("#FFFFFF").font("Helvetica-Bold");
      } else {
        doc.fillColor("#000000").font("Helvetica");
      }
      doc.fontSize(9);
      values.forEach((value, index) => {
        doc.text(value, x + 3, y, { width: columnWidths[index] - 6, align: columns[index].align, lineBreak: false, ellipsis: true });
        x += columnWidths[index];
      });
    }

    function ensureRoomFor(y: number, needed: number) {
      if (y + needed <= doc.page.height - doc.page.margins.bottom) return y;
      doc.addPage();
      const headerY = doc.page.margins.top;
      drawLineRow(headerY, columns.map((column) => column.header), true);
      return headerY + rowHeight;
    }

    let y = doc.y;
    drawLineRow(y, columns.map((column) => column.header), true);
    y += rowHeight;
    for (const line of input.lines) {
      y = ensureRoomFor(y, rowHeight);
      drawLineRow(y, [line.description, line.quantity.toString(), money(line.unitPrice), money(line.lineTotal)], false);
      y += rowHeight;
    }

    y += 10;
    y = ensureRoomFor(y, rowHeight * 6);
    const totalsX = left + usableWidth * 0.6;
    const totalsWidth = usableWidth * 0.4;
    function totalsRow(label: string, value: string, bold = false) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#000000");
      doc.text(label, totalsX, y, { width: totalsWidth * 0.6, align: "left" });
      doc.text(value, totalsX + totalsWidth * 0.6, y, { width: totalsWidth * 0.4, align: "right" });
      y += 14;
    }
    totalsRow("Subtotal", money(input.taxableAmount));
    if (input.vatAmount) totalsRow("VAT", money(input.vatAmount));
    if (input.nhilAmount) totalsRow("NHIL", money(input.nhilAmount));
    if (input.getfundAmount) totalsRow("GETFund Levy", money(input.getfundAmount));
    totalsRow("Total", money(input.amount), true);
    if (input.amountPaid !== undefined) {
      totalsRow("Paid", money(input.amountPaid));
      totalsRow("Balance due", money(input.amount - input.amountPaid), true);
    }

    if (input.notes) {
      y += 16;
      y = ensureRoomFor(y, 40);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text("Notes", left, y);
      doc.font("Helvetica").fontSize(9).fillColor("#555555").text(input.notes, left, y + 14, { width: usableWidth });
    }

    doc.end();
  });
}
