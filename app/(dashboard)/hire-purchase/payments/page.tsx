import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getPayments } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function PaymentsPage() {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE);
  const payments = await getPayments(tenant.organizationId);

  return (
    <DashboardShell title="Payments" subtitle="The 100 most recent installment payments across all accounts.">
      <div className="mb-6 flex justify-end">
        <Link
          href="/hire-purchase/accounts"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          Go to an account to record a payment
        </Link>
      </div>
      <SectionTable
        title={`Payment history (${payments.length})`}
        columns={["Receipt", "Customer", "Product", "Amount", "Date", "Method"]}
        rows={payments.map((p) => [p.receiptNo, p.customerName, p.productName, p.amount, p.paymentDate, p.method])}
      />
      {payments.length === 0 ? <p className="mt-4 text-sm text-slate-400">No payments recorded yet.</p> : null}
    </DashboardShell>
  );
}
