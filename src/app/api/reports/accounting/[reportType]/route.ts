import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  getTrialBalance,
  getGeneralLedgerForAccount,
  getReceivablesAgeing,
  getPayablesAgeing,
  getCashFlowStatement,
  NotFoundError,
} from "@/modules/accounting/service";
import { formatMoney } from "@/lib/currency";
import { buildReportExcelWorkbook, buildReportPdf, buildReportCsv, type ReportExportInput } from "@/lib/reports/export";

/**
 * One bespoke route for all four Track 8 reports, each with real per-row
 * data rather than the generic /api/reports/[moduleKey] summary-card
 * flatten - the same reasoning the Fleet owner statement's own bespoke
 * route already established.
 */
export async function GET(request: Request, { params }: { params: Promise<{ reportType: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { reportType } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format !== "pdf" && format !== "xlsx" && format !== "csv") {
    return NextResponse.json({ error: "format must be pdf, xlsx, or csv" }, { status: 400 });
  }

  const currency = tenant.organization.currency ?? "GHS";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  const generatedAt = new Date();

  let input: ReportExportInput;
  let filenameBase: string;

  if (reportType === "trial-balance") {
    const report = await getTrialBalance(tenant.organizationId, generatedAt);
    input = {
      title: "Trial Balance",
      subtitle: tenant.organization.name,
      generatedAt,
      summary: [
        { label: "As of", value: report.asOfDate.toLocaleDateString() },
        { label: "Total debit", value: money(report.totalDebit) },
        { label: "Total credit", value: money(report.totalCredit) },
      ],
      columns: [
        { key: "code", header: "Code", width: 1 },
        { key: "name", header: "Account", width: 2 },
        { key: "debit", header: `Debit (${currency})`, width: 1, align: "right", format: (value) => money(value as number) },
        { key: "credit", header: `Credit (${currency})`, width: 1, align: "right", format: (value) => money(value as number) },
      ],
      rows: report.rows.map((row) => ({ code: row.account.code, name: row.account.name, debit: row.debit, credit: row.credit })),
    };
    filenameBase = `trial-balance-${generatedAt.toISOString().slice(0, 10)}`;
  } else if (reportType === "general-ledger") {
    const accountId = url.searchParams.get("accountId");
    if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    let report;
    try {
      report = await getGeneralLedgerForAccount(tenant.organizationId, accountId);
    } catch (error) {
      if (error instanceof NotFoundError) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      throw error;
    }
    input = {
      title: `General Ledger - ${report.account.code} ${report.account.name}`,
      subtitle: tenant.organization.name,
      generatedAt,
      columns: [
        { key: "entryDate", header: "Date", width: 1 },
        { key: "description", header: "Description", width: 2 },
        { key: "postingNumber", header: "Posting #", width: 1 },
        { key: "debit", header: `Debit (${currency})`, width: 1, align: "right", format: (value) => money(value as number) },
        { key: "credit", header: `Credit (${currency})`, width: 1, align: "right", format: (value) => money(value as number) },
        { key: "runningBalance", header: `Balance (${currency})`, width: 1, align: "right", format: (value) => money(value as number) },
      ],
      rows: report.lines.map((line) => ({ ...line, entryDate: line.entryDate.toLocaleDateString() })),
    };
    filenameBase = `general-ledger-${report.account.code}-${generatedAt.toISOString().slice(0, 10)}`;
  } else if (reportType === "receivables-ageing" || reportType === "payables-ageing") {
    const isReceivables = reportType === "receivables-ageing";
    const report = isReceivables ? await getReceivablesAgeing(tenant.organizationId) : await getPayablesAgeing(tenant.organizationId);
    input = {
      title: isReceivables ? "Accounts Receivable Ageing" : "Accounts Payable Ageing",
      subtitle: tenant.organization.name,
      generatedAt,
      summary: [
        { label: "Outstanding", value: money(report.totals.outstanding) },
        { label: "Current", value: money(report.totals.current) },
        { label: "1-30 days", value: money(report.totals.days30) },
        { label: "31-60 days", value: money(report.totals.days60) },
        { label: "61-90 days", value: money(report.totals.days90) },
        { label: "90+ days", value: money(report.totals.over90) },
      ],
      columns: isReceivables
        ? [
            { key: "invoiceNumber", header: "Invoice", width: 1 },
            { key: "customerName", header: "Customer", width: 2 },
            { key: "dueDate", header: "Due", width: 1 },
            { key: "current", header: "Current", width: 1, align: "right", format: (value) => money(value as number) },
            { key: "days30", header: "1-30", width: 1, align: "right", format: (value) => money(value as number) },
            { key: "days60", header: "31-60", width: 1, align: "right", format: (value) => money(value as number) },
            { key: "days90", header: "61-90", width: 1, align: "right", format: (value) => money(value as number) },
            { key: "over90", header: "90+", width: 1, align: "right", format: (value) => money(value as number) },
          ]
        : [
            { key: "source", header: "Source", width: 1 },
            { key: "reference", header: "Reference", width: 1 },
            { key: "counterparty", header: "Supplier", width: 2 },
            { key: "dueDate", header: "Due", width: 1 },
            { key: "current", header: "Current", width: 1, align: "right", format: (value) => money(value as number) },
            { key: "days30", header: "1-30", width: 1, align: "right", format: (value) => money(value as number) },
            { key: "days60", header: "31-60", width: 1, align: "right", format: (value) => money(value as number) },
            { key: "days90", header: "61-90", width: 1, align: "right", format: (value) => money(value as number) },
            { key: "over90", header: "90+", width: 1, align: "right", format: (value) => money(value as number) },
          ],
      rows: report.rows.map((row) => ({ ...row, dueDate: row.dueDate.toLocaleDateString() })),
    };
    filenameBase = `${reportType}-${generatedAt.toISOString().slice(0, 10)}`;
  } else if (reportType === "cash-flow") {
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const to = toParam ? new Date(toParam) : generatedAt;
    const from = fromParam ? new Date(fromParam) : new Date(to.getFullYear(), to.getMonth(), 1);
    const report = await getCashFlowStatement(tenant.organizationId, from, to);
    input = {
      title: "Cash Flow Statement",
      subtitle: `${tenant.organization.name} - ${from.toLocaleDateString()} to ${to.toLocaleDateString()}`,
      generatedAt,
      summary: [
        { label: "Opening cash", value: money(report.openingCash) },
        { label: "Net change", value: money(report.netChange) },
        { label: "Closing cash", value: money(report.closingCash) },
      ],
      columns: [
        { key: "label", header: "Activity", width: 2 },
        { key: "amount", header: `Amount (${currency})`, width: 1, align: "right", format: (value) => money(value as number) },
      ],
      rows: [
        { label: "Operating activities", amount: report.operating },
        { label: "Investing activities", amount: report.investing },
        { label: "Financing activities", amount: report.financing },
        { label: "Net change in cash", amount: report.netChange },
      ],
    };
    filenameBase = `cash-flow-${generatedAt.toISOString().slice(0, 10)}`;
  } else {
    return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  }

  if (format === "csv") {
    const csv = buildReportCsv(input);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (format === "xlsx") {
    const buffer = await buildReportExcelWorkbook(input);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const buffer = await buildReportPdf(input);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
