import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getStaff } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function StaffPage() {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const staff = await getStaff(tenant.organizationId);

  return (
    <DashboardShell title="Staff" subtitle="The field sales roster responsible for customers, accounts, and collections.">
      <div className="mb-6 flex justify-end">
        <Link
          href="/hire-purchase/staff/new"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          + New staff
        </Link>
      </div>
      <SectionTable
        title={`Staff roster (${staff.length})`}
        columns={["Code", "Name", "Phone", "Customers", "Monthly salary", "Login linked", "Active"]}
        rows={staff.map((s) => [s.code, s.fullName, s.phone, String(s.customerCount), s.monthlySalary, s.linkedUser ? "Yes" : "No", s.active ? "Yes" : "No"])}
      />
      {staff.length === 0 ? <p className="mt-4 text-sm text-slate-400">No staff registered yet.</p> : null}
    </DashboardShell>
  );
}
