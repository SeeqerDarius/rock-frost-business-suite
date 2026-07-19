import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getCustomers } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function CustomersPage() {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE);
  const customers = await getCustomers(tenant.organizationId);

  return (
    <DashboardShell title="Customers" subtitle="Everyone registered for an installment plan, grouped by assigned staff.">
      <div className="mb-6 flex justify-end">
        <Link
          href="/hire-purchase/customers/new"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          + New customer
        </Link>
      </div>
      <SectionTable
        title={`Customer registry (${customers.length})`}
        columns={["Customer ID", "Name", "Phone", "Assigned staff", "Accounts", "Registered"]}
        rows={customers.map((c) => [c.customerCode, c.fullName, c.phone, c.staffName, String(c.accountCount), c.createdAt])}
      />
      {customers.length === 0 ? <p className="mt-4 text-sm text-slate-400">No customers yet.</p> : null}
    </DashboardShell>
  );
}
