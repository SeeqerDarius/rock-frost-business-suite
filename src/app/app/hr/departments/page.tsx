import Link from "next/link";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getHrSummary } from "@/modules/hr/service";

export default async function HrDepartmentsPage() {
  const tenant = await requireModuleAccess("hr");
  const summary = await getHrSummary(tenant.organizationId);
  const departments = Object.entries(summary.departmentCounts).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <PageHeader title="Departments" description="Employee counts by department." />
      {departments.length === 0 ? (
        <EmptyState icon={Building2} title="No departments yet" description="Departments appear once employees have one set." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {departments.map(([name, count]) => (
            <Link
              key={name}
              href={`/app/hr/employees?department=${encodeURIComponent(name)}`}
              className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:border-primary/40 hover:bg-secondary/50"
            >
              <IconBadge size="lg" className="size-14 rounded-2xl"><Building2 className="size-7" /></IconBadge>
              <span className="text-sm leading-tight font-medium">{name}</span>
              <span className="text-xs text-muted-foreground">{count} {count === 1 ? "employee" : "employees"}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
