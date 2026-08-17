import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, inputStyle, ErrorText, SyncBadge } from "@/components/form-fields";

/**
 * Milestone 6: campuses, academic years, and terms - the reference data
 * every later School screen (students, enrollment, fees, exams) depends
 * on. Milestone 7 adds classes and subjects here too (both gated by the
 * same school.academics.manage permission as academic year/term), keeping
 * every academic-catalog concept in one tab rather than a new one.
 */
export function SchoolAcademicSetupScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-setup-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 id="school-setup-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Academic setup
      </h2>
      <CampusSection snapshot={snapshot} onChanged={onChanged} />
      <AcademicYearSection snapshot={snapshot} onChanged={onChanged} />
      <TermSection snapshot={snapshot} onChanged={onChanged} />
      <ClassSection snapshot={snapshot} onChanged={onChanged} />
      <SubjectSection snapshot={snapshot} onChanged={onChanged} />
    </section>
  );
}

function CampusSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const codeId = useId();
  const nameId = useId();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!code.trim() || !name.trim()) {
      setError("Enter both a code and a name.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createCampus(crypto.randomUUID(), {
        code: code.trim().toUpperCase(),
        name: name.trim(),
      });
      setCode("");
      setName("");
      await onChanged();
    } catch {
      setError("Could not queue this campus. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Campuses</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Code" id={codeId}>
            <input id={codeId} value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, width: "8rem" }} />
          </Field>
          <Field label="Name" id={nameId}>
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add campus
          </Button>
        </form>
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.campuses.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No campuses cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.campuses.map((campus) => (
            <li key={campus.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>{campus.data.name}</p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>{campus.data.code}</p>
                </div>
                <SyncBadge pending={campus.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AcademicYearSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const nameId = useId();
  const startId = useId();
  const endId = useId();
  const currentId = useId();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [current, setCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!name.trim() || !startDate || !endDate) {
      setError("Enter a name, start date, and end date.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createAcademicYear(crypto.randomUUID(), {
        name: name.trim(),
        startDate,
        endDate,
        current,
      });
      setName("");
      setStartDate("");
      setEndDate("");
      setCurrent(false);
      await onChanged();
    } catch {
      setError("Could not queue this academic year. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Academic years</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Name" id={nameId} hint="e.g. 2026/2027">
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: "10rem" }} />
          </Field>
          <Field label="Start date" id={startId}>
            <input id={startId} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="End date" id={endId}>
            <input id={endId} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </Field>
          <label htmlFor={currentId} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", paddingBottom: "0.6rem" }}>
            <input id={currentId} type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
            Current
          </label>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add year
          </Button>
        </form>
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.academicYears.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No academic years cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.academicYears.map((year) => (
            <li key={year.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                    {year.data.name} {year.data.current ? <span style={{ color: "var(--rf-primary)" }}>&middot; Current</span> : null}
                  </p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
                    {new Date(year.data.startDate).toLocaleDateString()} to {new Date(year.data.endDate).toLocaleDateString()}
                  </p>
                </div>
                <SyncBadge pending={year.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TermSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const yearId = useId();
  const nameId = useId();
  const startId = useId();
  const endId = useId();
  const currentId = useId();
  const [academicYearId, setAcademicYearId] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [current, setCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!academicYearId || !name.trim() || !startDate || !endDate) {
      setError("Select an academic year and enter a name, start date, and end date.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createTerm(crypto.randomUUID(), {
        academicYearId,
        name: name.trim(),
        startDate,
        endDate,
        current,
      });
      setName("");
      setStartDate("");
      setEndDate("");
      setCurrent(false);
      await onChanged();
    } catch {
      setError("Could not queue this term. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Terms</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Academic year" id={yearId}>
            <select id={yearId} value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} style={{ ...inputStyle, width: "10rem" }}>
              <option value="">Select a year</option>
              {snapshot.academicYears.map((year) => (
                <option key={year.entityId} value={year.entityId}>
                  {year.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name" id={nameId} hint="e.g. Term 1">
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: "8rem" }} />
          </Field>
          <Field label="Start date" id={startId}>
            <input id={startId} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="End date" id={endId}>
            <input id={endId} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </Field>
          <label htmlFor={currentId} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", paddingBottom: "0.6rem" }}>
            <input id={currentId} type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
            Current
          </label>
          <Button type="submit" variant="secondary" loading={saving} disabled={snapshot.academicYears.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Add term
          </Button>
        </form>
        {snapshot.academicYears.length === 0 ? (
          <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>Add an academic year first.</p>
        ) : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.terms.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No terms cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.terms.map((term) => (
            <li key={term.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                    {term.data.name} {term.data.current ? <span style={{ color: "var(--rf-primary)" }}>&middot; Current</span> : null}
                  </p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
                    {new Date(term.data.startDate).toLocaleDateString()} to {new Date(term.data.endDate).toLocaleDateString()}
                  </p>
                </div>
                <SyncBadge pending={term.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClassSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const campusId = useId();
  const codeId = useId();
  const nameId = useId();
  const gradeId = useId();
  const capacityId = useId();
  const [campus, setCampus] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!campus || !code.trim() || !name.trim()) {
      setError("Select a campus and enter a code and a name.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createClass(crypto.randomUUID(), {
        campusId: campus,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        gradeLevel: gradeLevel.trim() || null,
        capacity: capacity.trim() ? Number(capacity) : null,
      });
      setCode("");
      setName("");
      setGradeLevel("");
      setCapacity("");
      await onChanged();
    } catch {
      setError("Could not queue this class. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Classes</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Campus" id={campusId}>
            <select id={campusId} value={campus} onChange={(e) => setCampus(e.target.value)} style={{ ...inputStyle, width: "10rem" }}>
              <option value="">Select a campus</option>
              {snapshot.campuses.map((c) => (
                <option key={c.entityId} value={c.entityId}>
                  {c.data.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Code" id={codeId}>
            <input id={codeId} value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, width: "6rem" }} />
          </Field>
          <Field label="Name" id={nameId}>
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: "8rem" }} />
          </Field>
          <Field label="Grade level" id={gradeId} hint="Optional">
            <input id={gradeId} value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} style={{ ...inputStyle, width: "6rem" }} />
          </Field>
          <Field label="Capacity" id={capacityId} hint="Optional">
            <input id={capacityId} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} style={{ ...inputStyle, width: "5rem" }} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={snapshot.campuses.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Add class
          </Button>
        </form>
        {snapshot.campuses.length === 0 ? <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>Add a campus first.</p> : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.classes.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No classes cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.classes.map((cls) => (
            <li key={cls.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>{cls.data.name}</p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
                    {cls.data.code} {cls.data.capacity ? `· up to ${cls.data.capacity}` : ""}
                  </p>
                </div>
                <SyncBadge pending={cls.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubjectSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const codeId = useId();
  const nameId = useId();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!code.trim() || !name.trim()) {
      setError("Enter both a code and a name.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createSubject(crypto.randomUUID(), {
        code: code.trim().toUpperCase(),
        name: name.trim(),
      });
      setCode("");
      setName("");
      await onChanged();
    } catch {
      setError("Could not queue this subject. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Subjects</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Code" id={codeId}>
            <input id={codeId} value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, width: "8rem" }} />
          </Field>
          <Field label="Name" id={nameId}>
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add subject
          </Button>
        </form>
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.subjects.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No subjects cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.subjects.map((subject) => (
            <li key={subject.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>{subject.data.name}</p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>{subject.data.code}</p>
                </div>
                <SyncBadge pending={subject.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
