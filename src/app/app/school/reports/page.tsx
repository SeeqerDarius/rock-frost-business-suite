import { ArrowDownRight, ArrowUpRight, BarChart3, Lock, Minus } from "lucide-react";
import { BreakdownDonutChart, PeriodicTrendChart, TrendChart } from "@/components/dashboard/charts";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ReportExportLinks } from "@/components/reports/report-export-links";
import { formatMoney } from "@/components/school/format";
import { SectionCard } from "@/components/school/section-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, getSchoolReportAnalytics, getSchoolSummary, listSchoolCampuses } from "@/modules/school/service";

const INPUT_CLASS = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Metric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <Card><CardContent className="pt-6"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p></CardContent></Card>;
}

function Comparison({ label, current, previous, format = "number", inverse = false }: { label: string; current: number | null; previous: number | null; format?: "number" | "percentage" | "money"; inverse?: boolean }) {
  const delta = current !== null && previous !== null ? current - previous : null;
  const improved = delta !== null && (inverse ? delta < 0 : delta > 0);
  const Icon = delta === 0 || delta === null ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const show = (value: number | null) => value === null ? "Not enough data" : format === "percentage" ? `${value}%` : format === "money" ? formatMoney(value) : value.toLocaleString();
  return <div className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0"><div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">Previous period: {show(previous)}</p></div><div className="text-right"><p className="font-semibold tabular-nums">{show(current)}</p><p className={delta === null || delta === 0 ? "text-xs text-muted-foreground" : improved ? "text-xs text-emerald-700 dark:text-emerald-400" : "text-xs text-destructive"}><Icon className="mr-1 inline size-3.5" />{delta === null ? "No comparison" : delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${format === "percentage" ? `${delta} pts` : format === "money" ? formatMoney(delta) : delta}`}</p></div></div>;
}

export default async function SchoolReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const tenant = await requireModuleAccess("school");
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_REPORTS_VIEW)) return <div className="mx-auto max-w-screen-2xl space-y-6"><PageHeader title="School Reports" description="Enrollment, attendance, collections, arrears, library, and transport indicators." /><EmptyState icon={Lock} title="School reports are restricted" description="Your role does not include School reporting. An organization administrator can grant the School reports permission." /></div>;

  const query = await searchParams;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  const parseDate = (value: string | undefined, fallback: Date) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : fallback;
  let from = parseDate(query.from, defaultFrom);
  let to = parseDate(query.to, today);
  if (from > to) [from, to] = [to, from];

  const [summary, campuses, academicSetup] = await Promise.all([getSchoolSummary(tenant.organizationId), listSchoolCampuses(tenant.organizationId), getSchoolAcademicSetup(tenant.organizationId)]);
  const classes = academicSetup[1];
  const campusId = campuses.some((campus) => campus.id === query.campusId) ? query.campusId : undefined;
  const classId = classes.some((schoolClass) => schoolClass.id === query.classId && (!campusId || schoolClass.campusId === campusId)) ? query.classId : undefined;
  const analytics = await getSchoolReportAnalytics(tenant.organizationId, { campusId, classId, from, to });
  const marked = Object.values(summary.attendance).reduce((total, count) => total + count, 0);
  const present = (summary.attendance.PRESENT ?? 0) + (summary.attendance.LATE ?? 0);
  const attendanceRate = marked > 0 ? `${Math.round((present / marked) * 100)}%` : "Not enough data";
  const billed = summary.collections.plus(summary.outstanding);
  const collectionRate = billed.gt(0) ? `${Math.round((Number(summary.collections) / Number(billed)) * 100)}%` : "Not enough data";
  const dateValue = (date: Date) => date.toISOString().slice(0, 10);
  const noFilteredActivity = analytics.current.marked === 0 && analytics.current.collections === 0;

  return <div className="mx-auto max-w-screen-2xl space-y-6">
    <PageHeader title="School Reports" description="Track attendance and fee performance, compare periods, and spot classes that need attention." actions={<ReportExportLinks moduleKey="school" />} />
    <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4" aria-label="Report filters">
      <div className="min-w-48 flex-1 space-y-1.5"><Label htmlFor="report-campus">Campus</Label><select id="report-campus" name="campusId" defaultValue={campusId ?? ""} className={INPUT_CLASS}><option value="">All campuses</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></div>
      <div className="min-w-48 flex-1 space-y-1.5"><Label htmlFor="report-class">Class</Label><select id="report-class" name="classId" defaultValue={classId ?? ""} className={INPUT_CLASS}><option value="">All classes</option>{classes.filter((schoolClass) => !campusId || schoolClass.campusId === campusId).map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}</select></div>
      <div className="w-40 space-y-1.5"><Label htmlFor="report-from">From</Label><input id="report-from" name="from" type="date" defaultValue={dateValue(from)} max={dateValue(today)} className={INPUT_CLASS} /></div>
      <div className="w-40 space-y-1.5"><Label htmlFor="report-to">To</Label><input id="report-to" name="to" type="date" defaultValue={dateValue(to)} max={dateValue(today)} className={INPUT_CLASS} /></div>
      <Button type="submit">Apply filters</Button><Button render={<a href="/app/school/reports" />} variant="ghost">Reset</Button>
    </form>
    {noFilteredActivity ? <EmptyState icon={BarChart3} title="No report activity in this period" description="Try a wider date range or another campus or class. Attendance and fee activity will appear here after staff record it." /> : null}
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="trends">Trends</TabsTrigger><TabsTrigger value="comparison">Comparison</TabsTrigger></TabsList>
      <TabsContent value="overview" className="space-y-6">
        <SectionCard title="School position" description="Current organization-wide totals."><dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active students" value={summary.activeStudents} hint="Students with an active record" /><Metric label="Active classes" value={summary.activeClasses} hint="Classes open for enrollment" /><Metric label="Attendance rate" value={attendanceRate} hint="Present and late across all recorded marks" /><Metric label="Collection rate" value={collectionRate} hint="Collected against collected plus outstanding" /></dl></SectionCard>
        <div className="grid gap-4 lg:grid-cols-2"><SectionCard title="Attendance mix" description="All attendance outcomes recorded to date."><BreakdownDonutChart data={[{ label: "Present", value: summary.attendance.PRESENT ?? 0 }, { label: "Late", value: summary.attendance.LATE ?? 0 }, { label: "Absent", value: summary.attendance.ABSENT ?? 0 }, { label: "Excused", value: summary.attendance.EXCUSED ?? 0 }]} valueFormat="count" /></SectionCard><SectionCard title="Fee position" description="Collected cash against remaining issued balances."><BreakdownDonutChart data={[{ label: "Collected", value: Number(summary.collections) }, { label: "Outstanding", value: Number(summary.outstanding) }]} currency={tenant.organization.currency} /></SectionCard></div>
      </TabsContent>
      <TabsContent value="trends" className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-2"><SectionCard title="Attendance trend" description="Present plus late as a share of marks across the last six periods."><PeriodicTrendChart data={analytics.trends} series={[{ key: "attendanceRate", label: "Attendance rate" }]} defaultPeriod="weeks" /></SectionCard><SectionCard title="Fee collection trend" description="Non-refunded fee payments received across the last six periods."><PeriodicTrendChart data={analytics.trends} series={[{ key: "collections", label: "Collected" }]} currency={tenant.organization.currency} defaultPeriod="weeks" /></SectionCard></div>
        <SectionCard title="Attendance by class" description="Filtered-period attendance rate for each class with recorded marks."><TrendChart data={analytics.classAttendance.filter((row) => row.marked > 0)} series={[{ key: "value", label: "Attendance rate" }]} valueFormat="percentage" /></SectionCard>
      </TabsContent>
      <TabsContent value="comparison"><SectionCard title="Period comparison" description="The selected period compared with the immediately preceding period of equal length."><Comparison label="Attendance rate" current={analytics.current.attendanceRate} previous={analytics.previous.attendanceRate} format="percentage" /><Comparison label="Absent marks" current={analytics.current.absent} previous={analytics.previous.absent} inverse /><Comparison label="Attendance marks recorded" current={analytics.current.marked} previous={analytics.previous.marked} /><Comparison label="Fee collections" current={analytics.current.collections} previous={analytics.previous.collections} format="money" /></SectionCard></TabsContent>
    </Tabs>
  </div>;
}
