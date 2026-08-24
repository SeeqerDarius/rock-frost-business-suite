import Link from "next/link";
import { Users, Mail, Phone } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { listEmployees, getHrSummary } from "@/modules/hr/service";

const TILE_COLORS = [
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
];

function tileColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

export default async function HrDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const { department } = await searchParams;
  const tenant = await requireModuleAccess("hr");
  const [allEmployees, summary] = await Promise.all([
    listEmployees(tenant.organizationId),
    getHrSummary(tenant.organizationId),
  ]);
  const active = allEmployees.filter((employee) => employee.status !== "TERMINATED");
  const employees = department ? active.filter((employee) => (employee.department ?? "Unassigned") === department) : active;
  const departments = Object.entries(summary.departmentCounts).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <PageHeader title="Directory" description="Look up anyone in your organization." />
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 space-y-1 lg:w-48">
          <p className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Department</p>
          <Link href="/app/hr/directory" className={`block rounded-md px-2 py-1.5 text-sm ${!department ? "bg-secondary font-medium" : "hover:bg-secondary/50"}`}>All</Link>
          {departments.map(([name, count]) => (
            <Link
              key={name}
              href={`/app/hr/directory?department=${encodeURIComponent(name)}`}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${department === name ? "bg-secondary font-medium" : "hover:bg-secondary/50"}`}
            >
              <span className="truncate">{name}</span>
              <span className="text-xs text-muted-foreground">{count}</span>
            </Link>
          ))}
        </aside>

        <div className="flex-1">
          {employees.length === 0 ? (
            <EmptyState icon={Users} title="No one here yet" description="Employees you add will appear in the directory." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {employees.map((employee) => (
                <div key={employee.id} className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center">
                  {employee.photoData ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={employee.photoData} alt="" className="size-14 rounded-full object-cover" />
                  ) : (
                    <span className={`flex size-14 items-center justify-center rounded-full text-xl font-semibold ${tileColor(employee.id)}`}>
                      {employee.fullName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-medium">{employee.fullName}</p>
                    <p className="text-xs text-muted-foreground">{employee.jobTitle ?? "-"}</p>
                  </div>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    {employee.email ? <p className="flex items-center justify-center gap-1 truncate"><Mail className="size-3 shrink-0" />{employee.email}</p> : null}
                    {employee.phone ? <p className="flex items-center justify-center gap-1"><Phone className="size-3 shrink-0" />{employee.phone}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
