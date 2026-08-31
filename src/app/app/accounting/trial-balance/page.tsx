import { Lock, Scale } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getTrialBalance } from "@/modules/accounting/service";
import { ReportDownloadLinks } from "@/components/reports/report-download-links";

export default async function AccountingTrialBalancePage() {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trial Balance" description="Every account's debit or credit balance as of today." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Trial balance is limited to roles with reporting permissions." />
      </div>
    );
  }

  const currency = tenant.organization.currency ?? "GHS";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  const report = await getTrialBalance(tenant.organizationId);
  const isBalanced = Math.abs(report.totalDebit - report.totalCredit) < 0.01;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trial Balance"
        description={`Every account's debit or credit balance as of ${report.asOfDate.toLocaleDateString()}.`}
        actions={<ReportDownloadLinks baseHref="/api/reports/accounting/trial-balance" />}
      />

      {report.rows.length === 0 ? (
        <EmptyState icon={Scale} title="No posted activity yet" description="Post a journal entry, invoice, bill, or expense to see account balances here." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit ({currency})</TableHead>
                <TableHead className="text-right">Credit ({currency})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.account.id}>
                  <TableCell className="font-mono text-xs">{row.account.code}</TableCell>
                  <TableCell className="font-medium">{row.account.name}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{row.debit > 0 ? money(row.debit) : ""}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{row.credit > 0 ? money(row.credit) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="font-medium">Total: {money(report.totalDebit)} / {money(report.totalCredit)}</span>
            <span className={isBalanced ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-destructive"}>
              {isBalanced ? "Balanced" : `Off by ${money(Math.abs(report.totalDebit - report.totalCredit))}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
