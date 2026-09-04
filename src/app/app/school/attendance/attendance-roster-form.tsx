"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { SchoolAttendanceStatus } from "@prisma/client";
import { Check, Clock3, ShieldCheck, UserX } from "lucide-react";
import { recordAttendanceBulkAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: Array<{ value: SchoolAttendanceStatus; label: string; short: string; icon: typeof Check; active: string }> = [
  { value: "PRESENT", label: "Present", short: "P", icon: Check, active: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600" },
  { value: "ABSENT", label: "Absent", short: "A", icon: UserX, active: "border-destructive bg-destructive text-white hover:bg-destructive" },
  { value: "LATE", label: "Late", short: "L", icon: Clock3, active: "border-amber-500 bg-amber-500 text-black hover:bg-amber-500" },
  { value: "EXCUSED", label: "Excused", short: "E", icon: ShieldCheck, active: "border-blue-600 bg-blue-600 text-white hover:bg-blue-600" },
];

type RosterEntry = {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  status: SchoolAttendanceStatus | null;
  reason: string | null;
};

function SaveButton({ count, dirty }: { count: number; dirty: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving attendance..." : `Save ${count} attendance marks${dirty ? "" : " again"}`}</Button>;
}

export function AttendanceRosterForm({ termId, classId, date, entries }: { termId: string; classId: string; date: string; entries: RosterEntry[] }) {
  const initialStatuses = useMemo(() => Object.fromEntries(entries.map((entry) => [entry.studentId, entry.status ?? "PRESENT"])) as Record<string, SchoolAttendanceStatus>, [entries]);
  const [statuses, setStatuses] = useState(initialStatuses);
  const [dirty, setDirty] = useState(false);
  const counts = STATUS_OPTIONS.map((option) => ({ ...option, count: Object.values(statuses).filter((status) => status === option.value).length }));

  const setStatus = (studentId: string, status: SchoolAttendanceStatus) => {
    setStatuses((current) => ({ ...current, [studentId]: status }));
    setDirty(true);
  };

  const markAllPresent = () => {
    setStatuses(Object.fromEntries(entries.map((entry) => [entry.studentId, "PRESENT"])) as Record<string, SchoolAttendanceStatus>);
    setDirty(true);
  };

  return (
    <form action={recordAttendanceBulkAction} className="space-y-4">
      <input type="hidden" name="termId" value={termId} />
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="date" value={date} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-live="polite" aria-label="Attendance totals">
          {counts.map((status) => <span key={status.value}><strong className="tabular-nums">{status.count}</strong> {status.label}</span>)}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={markAllPresent}>Mark all Present</Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[minmax(12rem,1fr)_minmax(18rem,auto)_minmax(12rem,1fr)] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
          <span>Student</span><span>Status</span><span>Reason</span>
        </div>
        <div className="divide-y">
          {entries.map((entry) => (
            <div key={entry.studentId} className="grid gap-3 p-3 md:grid-cols-[minmax(12rem,1fr)_minmax(18rem,auto)_minmax(12rem,1fr)] md:items-center md:px-4">
              <div>
                <p className="font-medium">{entry.lastName}, {entry.firstName}</p>
                <p className="font-mono text-xs text-muted-foreground">{entry.admissionNumber}</p>
              </div>
              <div role="group" aria-label={`Attendance status for ${entry.firstName} ${entry.lastName}`} className="grid grid-cols-4 gap-1.5">
                {STATUS_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = statuses[entry.studentId] === option.value;
                  return (
                    <button key={option.value} type="button" aria-pressed={selected} onClick={() => setStatus(entry.studentId, option.value)} className={cn("inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", selected ? option.active : "bg-background hover:bg-muted")}>
                      <Icon className="size-3.5" aria-hidden="true" /><span className="hidden sm:inline">{option.label}</span><span className="sm:hidden">{option.short}</span>
                    </button>
                  );
                })}
              </div>
              <div>
                <label htmlFor={`reason-${entry.studentId}`} className="sr-only">Reason for {entry.firstName} {entry.lastName}</label>
                <Input id={`reason-${entry.studentId}`} name={`reason_${entry.studentId}`} defaultValue={entry.reason ?? ""} maxLength={200} placeholder={statuses[entry.studentId] === "PRESENT" ? "Optional note" : "Reason, if known"} onChange={() => setDirty(true)} />
              </div>
              <input type="hidden" name={`status_${entry.studentId}`} value={statuses[entry.studentId]} />
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-sm">
        <p className="text-sm text-muted-foreground">{dirty ? "Unsaved attendance changes" : "Roster matches the last loaded state"}</p>
        <SaveButton count={entries.length} dirty={dirty} />
      </div>
    </form>
  );
}
