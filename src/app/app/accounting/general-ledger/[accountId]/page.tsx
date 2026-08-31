import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpenText, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getGeneralLedgerForAccount, NotFoundError } from "@/modules/accounting/service";
import { ReportDownloadLinks } from "@/components/reports/report-download-links";

export default async function AccountingGeneralLedgerAccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="General Ledger" description="Chronological transaction history for one account." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="The general ledger is limited to roles with reporting permissions." />
      </div>
    );
  }

  const currency = tenant.organization.currency ?? "GHS";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);

  let report;
  try {
    report = await getGeneralLedgerForAccount(tenant.organizationId, accountId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/app/accounting/general-ledger" />}>
        <ArrowLeft className="size-4" />Back to General Ledger
      </Button>
      <PageHeader
        title={`${report.account.code} ${report.account.name}`}
        description={`${report.account.type} account - full transaction history and running balance.`}
        actions={<ReportDownloadLinks baseHref={`/api/reports/accounting/general-ledger?accountId=${report.account.id}`} />}
      />

      {report.lines.length === 0 ? (
        <EmptyState icon={BookOpenText} title="No transactions posted yet" description="Journal lines posted against this account will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Posting #</TableHead>
              <TableHead className="text-right">Debit ({currency})</TableHead>
              <TableHead className="text-right">Credit ({currency})</TableHead>
              <TableHead className="text-right">Balance ({currency})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="text-muted-foreground">{line.entryDate.toLocaleDateString()}</TableCell>
                <TableCell>{line.description}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{line.postingNumber}</TableCell>
                <TableCell className="text-right text-muted-foreground">{line.debit > 0 ? money(line.debit) : ""}</TableCell>
                <TableCell className="text-right text-muted-foreground">{line.credit > 0 ? money(line.credit) : ""}</TableCell>
                <TableCell className="text-right font-medium">{money(line.runningBalance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
