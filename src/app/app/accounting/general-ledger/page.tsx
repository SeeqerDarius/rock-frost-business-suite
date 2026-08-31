import Link from "next/link";
import { ArrowRight, BookOpenText, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getGeneralLedgerAccounts } from "@/modules/accounting/service";

export default async function AccountingGeneralLedgerPage() {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="General Ledger" description="Open an account to see its chronological transaction history and running balance." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="The general ledger is limited to roles with reporting permissions." />
      </div>
    );
  }

  const currency = tenant.organization.currency ?? "GHS";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  const accounts = await getGeneralLedgerAccounts(tenant.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader title="General Ledger" description="Open an account to see its chronological transaction history and running balance." />

      {accounts.length === 0 ? (
        <EmptyState icon={BookOpenText} title="No accounts yet" description="Accounts you create in the Chart of Accounts will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Balance ({currency})</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-mono text-xs">{account.code}</TableCell>
                <TableCell className="font-medium">{account.name}</TableCell>
                <TableCell className="text-muted-foreground">{account.type}</TableCell>
                <TableCell className="text-right text-muted-foreground">{money(account.balance)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/app/accounting/general-ledger/${account.id}`} />}>
                    View<ArrowRight className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
