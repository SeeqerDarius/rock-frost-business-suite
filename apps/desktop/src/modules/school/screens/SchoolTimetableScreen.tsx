import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, inputStyle, selectStyle, ErrorText, SyncBadge } from "@/components/form-fields";

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
    <section aria-labelledby="school-timetable-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 id="school-timetable-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Timetable
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <Card>
          <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
            <Field label="Campus" id={campusId}>
              <select id={campusId} value={campus} onChange={(e) => setCampus(e.target.value)} style={{ ...selectStyle, width: "9rem" }}>
                <option value="">Select a campus</option>
                {snapshot.campuses.map((c) => (
                  <option key={c.entityId} value={c.entityId}>{c.data.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Term" id={termId}>
              <select id={termId} value={term} onChange={(e) => setTerm(e.target.value)} style={{ ...selectStyle, width: "8rem" }}>
                <option value="">Select a term</option>
                {snapshot.terms.map((t) => (
                  <option key={t.entityId} value={t.entityId}>{t.data.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Class" id={classId}>
              <select id={classId} value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)} style={{ ...selectStyle, width: "8rem" }}>
                <option value="">Select a class</option>
                {snapshot.classes.map((c) => (
                  <option key={c.entityId} value={c.entityId}>{c.data.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Subject" id={subjectId}>
              <select id={subjectId} value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...selectStyle, width: "8rem" }}>
                <option value="">Select a subject</option>
                {snapshot.subjects.map((s) => (
                  <option key={s.entityId} value={s.entityId}>{s.data.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Teacher" id={teacherId}>
              <input id={teacherId} value={teacherName} onChange={(e) => setTeacherName(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
            </Field>
            <Field label="Room" id={roomId} hint="Optional">
              <input id={roomId} value={room} onChange={(e) => setRoom(e.target.value)} style={{ ...inputStyle, width: "6rem" }} />
            </Field>
            <Field label="Day" id={dayId}>
              <select id={dayId} value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} style={{ ...selectStyle, width: "8rem" }}>
                {DAY_NAMES.slice(1).map((name, i) => (
                  <option key={name} value={i + 1}>{name}</option>
                ))}
              </select>
            </Field>
            <Field label="Starts" id={startsId}>
              <input id={startsId} type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={{ ...inputStyle, width: "6.5rem" }} />
            </Field>
            <Field label="Ends" id={endsId}>
              <input id={endsId} type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={{ ...inputStyle, width: "6.5rem" }} />
            </Field>
            <Button type="submit" variant="secondary" loading={saving} disabled={snapshot.classes.length === 0}>
              <Plus size={14} aria-hidden="true" />
              Add period
            </Button>
          </form>
          {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
        </Card>

        {snapshot.timetableEntries.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No timetable periods cached on this device yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {snapshot.timetableEntries.map((entry) => (
              <li key={entry.entityId}>
                <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                      {DAY_NAMES[entry.data.dayOfWeek]} &middot; {entry.data.startsAt}&ndash;{entry.data.endsAt}
                    </p>
                    <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
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
