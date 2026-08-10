import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { SectionCard } from "@/components/school/section-card";
import { formatMoney } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolSummary } from "@/modules/school/service";

function Metric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default async function SchoolReportsPage() {
  const tenant = await requireModuleAccess("school");

  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_REPORTS_VIEW)) {
    return (
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <PageHeader title="School Reports" description="Enrollment, attendance, collections, arrears, library, and transport indicators." />
        <EmptyState icon={Lock} title="School reports are restricted" description="Your role does not include School reporting. An organization administrator can grant the School reports permission." />
      </div>
    );
  }

  const summary = await getSchoolSummary(tenant.organizationId);
  const marked = Object.values(summary.attendance).reduce((total, count) => total + count, 0);
  const present = (summary.attendance.PRESENT ?? 0) + (summary.attendance.LATE ?? 0);
  const attendanceRate = marked > 0 ? `${Math.round((present / marked) * 100)}%` : "—";
  const billed = summary.collections.plus(summary.outstanding);
  const collectionRate = billed.gt(0) ? `${Math.round((Number(summary.collections) / Number(billed)) * 100)}%` : "—";

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="School Reports"
        description="Live indicators across enrollment, attendance, fee collection, library, and transport. Figures cover the whole organization to date."
      />

      <SectionCard title="Enrollment" description="Current student and class position.">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Metric label="Active students" value={summary.activeStudents} hint="Students with an active record" />
          <Metric label="Active classes" value={summary.activeClasses} hint="Classes open for enrollment" />
        </dl>
      </SectionCard>

      <SectionCard title="Attendance" description="Every attendance record captured to date.">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Attendance rate" value={attendanceRate} hint="Present and late as a share of all marks" />
          <Metric label="Present" value={summary.attendance.PRESENT ?? 0} hint="Records marked present" />
          <Metric label="Absent" value={summary.attendance.ABSENT ?? 0} hint="Records marked absent" />
          <Metric label="Late" value={summary.attendance.LATE ?? 0} hint="Records marked late" />
        </dl>
      </SectionCard>

      <SectionCard title="Fee collection" description="Receipts and arrears across all campuses.">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Metric label="Collected" value={formatMoney(summary.collections)} hint="Payments received, excluding refunds" />
          <Metric label="Outstanding" value={formatMoney(summary.outstanding)} hint="Balance on issued and part-paid invoices" />
          <Metric label="Collection rate" value={collectionRate} hint="Collected as a share of collected plus outstanding" />
        </dl>
      </SectionCard>

      <SectionCard title="Services" description="Library circulation and transport coverage.">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Metric label="Overdue library loans" value={summary.overdueLoans} hint="Open loans past their due date" />
          <Metric label="Active transport routes" value={summary.activeRoutes} hint="Routes currently in service" />
        </dl>
      </SectionCard>
    </div>
  );
}
