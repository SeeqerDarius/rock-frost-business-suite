import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getInvoiceForPrint, getBillForPrint } from "@/modules/accounting/service";
import { buildPrintableDocumentPdf, type PrintableDocumentInput } from "@/lib/reports/invoice-pdf";

/**
 * Ghana-formatted printable PDF for an invoice or a bill - a document-style
 * layout (letterhead, counterparty block, line items, VAT/NHIL/GETFund
 * breakdown), not a tabular report. A paid document doubles as its own
 * receipt: the totals block already shows "Paid" and "Balance due" once
 * amountPaid is greater than zero, so this route does not need a third,
 * separate receipt template to cover that case.
 */
export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type } = await params;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const organization = await db.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { name: true, address: true, taxNumber: true, phone: true, email: true },
  });
  if (!organization) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  let input: PrintableDocumentInput;
  let filenameBase: string;

  if (type === "invoice") {
    if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE) && !hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECEIVABLES_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const invoice = await getInvoiceForPrint(tenant.organizationId, id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    input = {
      documentType: "INVOICE",
      documentNumber: invoice.invoiceNumber,
      documentDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      organization,
      counterpartyLabel: "Bill to",
      counterpartyName: invoice.customerName,
      counterpartyEmail: invoice.customerEmail,
      counterpartyTin: invoice.contact?.taxIdentificationNumber ?? null,
      currency: tenant.organization.currency ?? "GHS",
      lines: invoice.lines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), lineTotal: Number(line.lineTotal) })),
      taxableAmount: Number(invoice.taxableAmount),
      vatAmount: Number(invoice.vatAmount),
      nhilAmount: Number(invoice.nhilAmount),
      getfundAmount: Number(invoice.getfundAmount),
      amount: Number(invoice.amount),
      amountPaid: Number(invoice.amountPaid) + Number(invoice.amountCredited),
      notes: invoice.description,
    };
    filenameBase = `invoice-${invoice.invoiceNumber}`;
  } else if (type === "bill") {
    if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_BILLS_MANAGE) && !hasPermission(tenant, PERMISSIONS.ACCOUNTING_PAYABLES_MANAGE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const bill = await getBillForPrint(tenant.organizationId, id);
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    input = {
      documentType: "BILL",
      documentNumber: bill.billNumber,
      documentDate: bill.billDate,
      dueDate: bill.dueDate,
      organization,
      counterpartyLabel: "Supplier",
      counterpartyName: bill.supplierName,
      counterpartyEmail: bill.supplierEmail,
      counterpartyTin: bill.contact?.taxIdentificationNumber ?? null,
      currency: tenant.organization.currency ?? "GHS",
      lines: bill.lines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), lineTotal: Number(line.lineTotal) })),
      taxableAmount: Number(bill.taxableAmount),
      vatAmount: Number(bill.vatAmount),
      nhilAmount: Number(bill.nhilAmount),
      getfundAmount: Number(bill.getfundAmount),
      amount: Number(bill.amount),
      amountPaid: Number(bill.amountPaid),
      notes: bill.description,
    };
    filenameBase = `bill-${bill.billNumber}`;
  } else {
    return NextResponse.json({ error: "Unknown document type" }, { status: 404 });
  }

  const buffer = await buildPrintableDocumentPdf(input);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filenameBase}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
