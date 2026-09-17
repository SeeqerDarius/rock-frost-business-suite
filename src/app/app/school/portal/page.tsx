import { CalendarCheck, GraduationCap, IdCard, Lock, Receipt, ShieldAlert, ShieldOff, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { SectionCard } from "@/components/school/section-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { resolveSchoolPortalScope, getSchoolPortalStudentSummary } from "@/modules/school/portal-service";
import { isSchoolPortalGranted } from "@/lib/platform-communications";

export default async function SchoolPortalPage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);

  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW)) {
    return (
      <div className="mx-auto max-w-screen-lg space-y-6">
        <PageHeader title="My Portal" description="Your own or your child's school activity." />
        <EmptyState icon={Lock} title="Portal access is restricted" description="Your role does not include School portal access." />
      </div>
    );
  }

  if (!(await isSchoolPortalGranted(tenant.organizationId))) {
    return (
      <div className="mx-auto max-w-screen-lg space-y-6">
        <PageHeader title="My Portal" description="Your own or your child's school activity." />
        <EmptyState icon={ShieldOff} title="Not available right now" description="This feature is not currently enabled for your school. Contact the school office for more information." />
      </div>
    );
  }

  const scope = await resolveSchoolPortalScope(tenant.organizationId, tenant.userId);
  if (!scope) {
    return (
      <div className="mx-auto max-w-screen-lg space-y-6">
        <PageHeader title="My Portal" description="Your own or your child's school activity." />
        <EmptyState icon={Users} title="No linked record yet" description="Ask the school office to link your account to a student or guardian record from Portal Access." />
      </div>
    );
  }

  let studentId: string;
  let switcher: { id: string; label: string }[] = [];
  if (scope.type === "student") {
    studentId = scope.studentId;
  } else {
    if (scope.studentIds.length === 0) {
      return (
        <div className="mx-auto max-w-screen-lg space-y-6">
          <PageHeader title="My Portal" description="Your children's school activity." />
          <EmptyState icon={Users} title="No children linked yet" description="Ask the school office to link a student to your guardian record from Portal Access." />
        </div>
      );
    }
    const students = await Promise.all(scope.studentIds.map((id) => getSchoolPortalStudentSummary(tenant.organizationId, id)));
    switcher = students.map((s) => ({ id: s.student.id, label: `${s.student.firstName} ${s.student.lastName}` }));
    const requested = query.studentId && scope.studentIds.includes(query.studentId) ? query.studentId : scope.studentIds[0];
    studentId = requested;
  }

  const summary = await getSchoolPortalStudentSummary(tenant.organizationId, studentId);

  return (
    <div className="mx-auto max-w-screen-lg space-y-6">
      <PageHeader title="My Portal" description={`Attendance, results, fees, and digital ID for ${summary.student.firstName} ${summary.student.lastName}.`} />

      {switcher.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {switcher.map((child) => (
            <a key={child.id} href={`/app/school/portal?studentId=${child.id}`} className={`rounded-full border px-3 py-1 text-sm ${child.id === studentId ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              {child.label}
            </a>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewMetricCard label="Class" value={summary.currentClassName ?? "Not enrolled"} description={`Admission ${summary.student.admissionNumber}`} icon={<GraduationCap className="size-5" />} />
        <OverviewMetricCard label="Attendance" value={summary.attendance.presentRate !== null ? `${summary.attendance.presentRate}%` : "No data"} description="Present or late, all time" icon={<CalendarCheck className="size-5" />} />
        <OverviewMetricCard label="Outstanding fees" value={formatMoney(summary.fees.outstandingTotal)} description="Across all issued invoices" icon={<Receipt className="size-5" />} />
        <OverviewMetricCard label="Class position" value={summary.broadsheetPosition ? `${summary.broadsheetPosition.position} of ${summary.broadsheetPosition.outOf}` : "Not ranked"} description="Most recent published exam's term" icon={<ShieldAlert className="size-5" />} />
      </div>

      <SectionCard title="Recent exam results" description="Only published results are shown.">
        {summary.results.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No published results yet.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead className="text-center">Marks</TableHead><TableHead className="text-center">Grade</TableHead><TableHead className="hidden sm:table-cell">Remark</TableHead></TableRow></TableHeader>
            <TableBody>
              {summary.results.map((result) => (
                <TableRow key={result.id}>
                  <TableCell>{result.examName}</TableCell>
                  <TableCell>{result.subjectName}</TableCell>
                  <TableCell className="text-center tabular-nums">{result.marks} / {result.totalMarks}</TableCell>
                  <TableCell className="text-center">{result.grade ?? "-"}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{result.remark ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="Recent attendance" description="Last 10 recorded days.">
        {summary.attendance.recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No attendance recorded yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {summary.attendance.recent.map((entry, index) => (
              <li key={index}><Badge variant={entry.status === "PRESENT" ? "default" : entry.status === "ABSENT" ? "destructive" : "outline"}>{formatDate(entry.date)}: {entry.status}</Badge></li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Fee invoices" description="Most recent 10 issued invoices.">
        {summary.fees.invoices.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No fee invoices yet.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Description</TableHead><TableHead className="text-center">Amount</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="hidden sm:table-cell">Due</TableHead></TableRow></TableHeader>
            <TableBody>
              {summary.fees.invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
                  <TableCell>{invoice.description}</TableCell>
                  <TableCell className="text-center tabular-nums">{formatMoney(invoice.amount)}</TableCell>
                  <TableCell className="text-center"><Badge variant="outline">{invoice.status}</Badge></TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{invoice.dueDate ? formatDate(invoice.dueDate) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {summary.conduct.length > 0 ? (
        <SectionCard title="Conduct" description="Most recent 10 records.">
          <ul className="space-y-2">
            {summary.conduct.map((record) => (
              <li key={record.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>{record.category} · {formatDate(record.occurredAt)}</span>
                <Badge variant={record.classification === "POSITIVE" ? "default" : "destructive"}>{record.severity}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Digital ID" description="Current identity card status.">
        {summary.digitalId ? (
          <div className="flex items-center gap-3">
            <IdCard className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Active, expires {formatDate(summary.digitalId.expiryDate)}</p>
              <p className="text-sm text-muted-foreground">Ask the school office for a printed or QR copy of this card.</p>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No active digital ID has been issued yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
