import { Card } from "@/components/Card";
import { formatMoney } from "@/components/form-fields";
import { computeFeeInvoiceOutstanding } from "@/modules/school/fee-utils";
import type { SchoolSnapshot } from "@/modules/school/school-data";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="m-0 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="m-0 text-2xl font-extrabold">{value}</p>
      {hint ? <p className="m-0 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="m-0 text-xs text-muted-foreground">{label}</p>
      <p className="m-0 mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function SchoolOverviewScreen({ snapshot }: { snapshot: SchoolSnapshot }) {
  const activeStudents = snapshot.students.filter((s) => s.data.status === "ACTIVE").length;
  const activeClasses = snapshot.classes.length;

  let outstanding = 0;
  let collected = 0;
  for (const invoice of snapshot.feeInvoices) {
    outstanding += computeFeeInvoiceOutstanding(invoice.data);
    for (const payment of invoice.data.payments) {
      if (!payment.refundedAt) collected += Number(payment.amount);
    }
  }

  const overdueLoans = snapshot.libraryLoans.filter((l) => l.data.status === "OVERDUE").length;

  const attendanceCounts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const entry of snapshot.attendance) attendanceCounts[entry.data.status] += 1;
  const marked = attendanceCounts.PRESENT + attendanceCounts.ABSENT + attendanceCounts.LATE + attendanceCounts.EXCUSED;
  const present = attendanceCounts.PRESENT + attendanceCounts.LATE;
  const attendanceRate = marked > 0 ? Math.round((present / marked) * 100) : null;

  const currentYear = snapshot.academicYears.find((y) => y.data.current);
  const currentTerm = snapshot.terms.find((t) => t.data.current);

  const pendingCount =
    snapshot.students.filter((s) => s.hasPendingLocalChange).length +
    snapshot.feeInvoices.filter((i) => i.hasPendingLocalChange).length +
    snapshot.attendance.filter((a) => a.hasPendingLocalChange).length;

  return (
    <section aria-labelledby="school-overview-heading" className="flex flex-col gap-4">
      <h2 id="school-overview-heading" className="m-0 text-[1.05rem] font-bold">
        Overview
      </h2>

      {snapshot.classes.length === 0 ? (
        <Card>
          <p className="m-0 text-sm text-muted-foreground">
            No classes cached on this device yet. Create a class under Academic Setup, or sync once online.
          </p>
        </Card>
      ) : null}

      {currentYear ? (
        <p className="m-0 text-sm text-muted-foreground">
          Current academic year: <span className="font-medium text-foreground">{currentYear.data.name}</span>
          {currentTerm ? (
            <>
              {" "}&middot; Current term: <span className="font-medium text-foreground">{currentTerm.data.name}</span>
            </>
          ) : (
            " · No current term is set"
          )}
        </p>
      ) : null}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
        <Tile label="Active students" value={String(activeStudents)} hint="Currently enrolled learners" />
        <Tile label="Active classes" value={String(activeClasses)} hint="Classes available for enrollment" />
        <Tile label="Outstanding fees" value={formatMoney(String(outstanding))} hint="Open student fee balances" />
        <Tile label="Overdue library loans" value={String(overdueLoans)} hint="Loans beyond their due date" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div>
            <p className="m-0 text-sm font-semibold">Attendance to date</p>
            <p className="m-0 text-xs text-muted-foreground">Across every attendance record captured on this device.</p>
          </div>
          {marked === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">No attendance has been recorded yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatRow label="Attendance rate" value={`${attendanceRate}%`} />
              <StatRow label="Present" value={attendanceCounts.PRESENT} />
              <StatRow label="Absent" value={attendanceCounts.ABSENT} />
              <StatRow label="Late" value={attendanceCounts.LATE} />
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div>
            <p className="m-0 text-sm font-semibold">Fee position</p>
            <p className="m-0 text-xs text-muted-foreground">Collections and arrears across cached invoices.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatRow label="Collected" value={formatMoney(String(collected))} />
            <StatRow label="Outstanding" value={formatMoney(String(outstanding))} />
          </div>
        </Card>
      </div>

      {pendingCount > 0 ? (
        <Card>
          <p className="m-0 text-[0.8125rem]">
            {pendingCount} {pendingCount === 1 ? "change is" : "changes are"} waiting to sync. They already count above and
            are visible everywhere on this device, but the cloud copy will not reflect them until the next successful sync.
          </p>
        </Card>
      ) : null}
    </section>
  );
}
