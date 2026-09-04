import { Lock } from "lucide-react";
import { BreakdownDonutChart } from "@/components/dashboard/charts";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard } from "@/components/school/section-card";
import { formatMoney } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolSummary } from "@/modules/school/service";
import { ReportExportLinks } from "@/components/reports/report-export-links";

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
  const attendanceRate = marked > 0 ? `${Math.round((present / marked) * 100)}%` : "-";
  const billed = summary.collections.plus(summary.outstanding);
  const collectionRate = billed.gt(0) ? `${Math.round((Number(summary.collections) / Number(billed)) * 100)}%` : "-";
  const attendanceData = [
    { name: "Present", value: summary.attendance.PRESENT ?? 0 },
    { name: "Late", value: summary.attendance.LATE ?? 0 },
    { name: "Absent", value: summary.attendance.ABSENT ?? 0 },
    { name: "Excused", value: summary.attendance.EXCUSED ?? 0 },
  ];
  const collectionData = [
    { name: "Collected", value: Number(summary.collections) },
    { name: "Outstanding", value: Number(summary.outstanding) },
  ];

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="School Reports"
        description="Live indicators across enrollment, attendance, fee collection, library, and transport. Figures cover the whole organization to date."
        actions={<ReportExportLinks moduleKey="school" />}
      />

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
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
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Attendance mix" description="The current share of attendance outcomes recorded across the school.">
              <BreakdownDonutChart data={attendanceData.map((item) => ({ label: item.name, value: item.value }))} valueFormat="count" />
            </SectionCard>

            <SectionCard title="Fee movement" description="Cash received versus the remaining open balance.">
              <BreakdownDonutChart data={collectionData.map((item) => ({ label: item.name, value: item.value }))} />
            </SectionCard>
          </div>

          <SectionCard title="Signals" description="Quick interpretation when the school has too little data to compare trend linearly.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Attendance health" value={marked > 0 ? attendanceRate : "Not enough data"} hint={marked > 0 ? "Present and late are the healthiest outcomes in this dataset" : "Add attendance marks to begin a trend."} />
              <Metric label="Collection performance" value={billingSignal(collectionRate)} hint="A quick status label for how well the school is covering its open fees." />
              <Metric label="Academic load" value={summary.activeClasses} hint="Classes currently open for teaching and student placement" />
              <Metric label="Service coverage" value={summary.activeRoutes} hint="Active routes currently serving students" />
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function billingSignal(value: string) {
  if (value === "-") return "Not enough data";
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric)) return "Not enough data";
  if (numeric >= 80) return "Strong";
  if (numeric >= 60) return "Healthy";
  if (numeric >= 40) return "Watch";
  return "Needs attention";
}
