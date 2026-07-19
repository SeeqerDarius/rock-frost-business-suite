import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getAccounts } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function AccountsPage() {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE);
  const accounts = await getAccounts(tenant.organizationId);

  return (
    <DashboardShell title="Accounts" subtitle="Every installment contract, its progress, and delivery status.">
      <div className="mb-6 flex justify-end">
        <Link
          href="/hire-purchase/accounts/new"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          + New account
        </Link>
      </div>
      <SectionTable
        title={`Account registry (${accounts.length})`}
        columns={["Customer", "Product", "Progress", "Balance", "Status", "Delivery"]}
        rows={accounts.map((a) => [
          `${a.customerName} (${a.customerCode})`,
          a.productName,
          `${a.progressPercent}%`,
          a.balance,
          a.status,
          a.deliveryStatus,
        ])}
      />
      {accounts.length === 0 ? <p className="mt-4 text-sm text-slate-400">No installment accounts yet.</p> : null}
    </DashboardShell>
  );
}
