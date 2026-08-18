import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, ErrorText, SyncBadge } from "@/components/form-fields";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SchoolTimetableScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const campusId = useId();
  const termId = useId();
  const classId = useId();
  const subjectId = useId();
  const teacherId = useId();
  const roomId = useId();
  const dayId = useId();
  const startsId = useId();
  const endsId = useId();
  const [campus, setCampus] = useState("");
  const [term, setTerm] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [subject, setSubject] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [room, setRoom] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameForClass = (id: string) => snapshot.classes.find((c) => c.entityId === id)?.data.name ?? id.slice(0, 8);
  const nameForSubject = (id: string) => snapshot.subjects.find((s) => s.entityId === id)?.data.name ?? id.slice(0, 8);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!campus || !term || !schoolClass || !subject || !teacherName.trim() || endsAt <= startsAt) {
      setError("Select a campus, term, class, and subject, enter a teacher, and make sure the end time is after the start time.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createTimetableEntry(crypto.randomUUID(), {
        campusId: campus,
        termId: term,
        classId: schoolClass,
        subjectId: subject,
        teacherName: teacherName.trim(),
        room: room.trim() || null,
        dayOfWeek: Number(dayOfWeek),
        startsAt,
        endsAt,
      });
      setTeacherName("");
      setRoom("");
      await onChanged();
    } catch {
      setError("Could not queue this timetable entry. It may conflict with an existing class, teacher, or room period.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="school-timetable-heading" className="flex flex-col gap-6">
      <h2 id="school-timetable-heading" className="m-0 text-[1.05rem] font-bold">
        Timetable
      </h2>
      <div className="flex flex-col gap-2.5">
        <Card>
          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
            <Field label="Campus" id={campusId} className="w-36">
              <Select value={campus} onValueChange={(value) => setCampus(value ?? "")}>
                <SelectTrigger id={campusId} className="w-full">
                  <SelectValue placeholder="Select a campus" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.campuses.map((c) => (
                    <SelectItem key={c.entityId} value={c.entityId}>{c.data.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Term" id={termId} className="w-32">
              <Select value={term} onValueChange={(value) => setTerm(value ?? "")}>
                <SelectTrigger id={termId} className="w-full">
                  <SelectValue placeholder="Select a term" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.terms.map((t) => (
                    <SelectItem key={t.entityId} value={t.entityId}>{t.data.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Class" id={classId} className="w-32">
              <Select value={schoolClass} onValueChange={(value) => setSchoolClass(value ?? "")}>
                <SelectTrigger id={classId} className="w-full">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.classes.map((c) => (
                    <SelectItem key={c.entityId} value={c.entityId}>{c.data.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subject" id={subjectId} className="w-32">
              <Select value={subject} onValueChange={(value) => setSubject(value ?? "")}>
                <SelectTrigger id={subjectId} className="w-full">
                  <SelectValue placeholder="Select a subject" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.subjects.map((s) => (
                    <SelectItem key={s.entityId} value={s.entityId}>{s.data.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Teacher" id={teacherId} className="w-36">
              <Input id={teacherId} value={teacherName} onChange={(e) => setTeacherName(e.target.value)} />
            </Field>
            <Field label="Room" id={roomId} hint="Optional" className="w-24">
              <Input id={roomId} value={room} onChange={(e) => setRoom(e.target.value)} />
            </Field>
            <Field label="Day" id={dayId} className="w-32">
              <Select value={dayOfWeek} onValueChange={(value) => setDayOfWeek(value ?? "1")}>
                <SelectTrigger id={dayId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.slice(1).map((name, i) => (
                    <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Starts" id={startsId} className="w-28">
              <Input id={startsId} type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Ends" id={endsId} className="w-28">
              <Input id={endsId} type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
            <Button type="submit" variant="secondary" loading={saving} disabled={snapshot.classes.length === 0}>
              <Plus size={14} aria-hidden="true" />
              Add period
            </Button>
          </form>
          {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
        </Card>

        {snapshot.timetableEntries.length === 0 ? (
          <p className="m-0 text-[0.8125rem] text-muted-foreground">No timetable periods cached on this device yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {snapshot.timetableEntries.map((entry) => (
              <li key={entry.entityId}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-semibold">
                      {DAY_NAMES[entry.data.dayOfWeek]} &middot; {entry.data.startsAt}&ndash;{entry.data.endsAt}
                    </p>
                    <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
                      {nameForClass(entry.data.classId)} &middot; {nameForSubject(entry.data.subjectId)} &middot; {entry.data.teacherName}
                      {entry.data.room ? ` · ${entry.data.room}` : ""}
                    </p>
                  </div>
                  <SyncBadge pending={entry.hasPendingLocalChange} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
