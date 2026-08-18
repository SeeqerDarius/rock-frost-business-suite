import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, ErrorText, SyncBadge } from "@/components/form-fields";

/**
 * Milestone 6: campuses, academic years, and terms - the reference data
 * every later School screen (students, enrollment, fees, exams) depends
 * on. Milestone 7 adds classes and subjects here too (both gated by the
 * same school.academics.manage permission as academic year/term), keeping
 * every academic-catalog concept in one tab rather than a new one.
 */
export function SchoolAcademicSetupScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-setup-heading" className="flex flex-col gap-6">
      <h2 id="school-setup-heading" className="m-0 text-[1.05rem] font-bold">
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
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Campuses</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Code" id={codeId} className="w-32">
            <Input id={codeId} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Name" id={nameId}>
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add campus
          </Button>
        </form>
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.campuses.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No campuses cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.campuses.map((campus) => (
            <li key={campus.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">{campus.data.name}</p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">{campus.data.code}</p>
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
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Academic years</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Name" id={nameId} hint="e.g. 2026/2027" className="w-40">
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Start date" id={startId}>
            <Input id={startId} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date" id={endId}>
            <Input id={endId} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <label htmlFor={currentId} className="flex items-center gap-1.5 pb-2.5 text-[0.8125rem]">
            <Checkbox id={currentId} checked={current} onCheckedChange={(checked) => setCurrent(checked === true)} />
            Current
          </label>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add year
          </Button>
        </form>
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.academicYears.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No academic years cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.academicYears.map((year) => (
            <li key={year.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">
                    {year.data.name} {year.data.current ? <span className="text-primary">&middot; Current</span> : null}
                  </p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
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
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Terms</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Academic year" id={yearId} className="w-40">
            <Select value={academicYearId} onValueChange={(value) => setAcademicYearId(value ?? "")}>
              <SelectTrigger id={yearId} className="w-full">
                <SelectValue placeholder="Select a year" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.academicYears.map((year) => (
                  <SelectItem key={year.entityId} value={year.entityId}>
                    {year.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Name" id={nameId} hint="e.g. Term 1" className="w-32">
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Start date" id={startId}>
            <Input id={startId} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date" id={endId}>
            <Input id={endId} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <label htmlFor={currentId} className="flex items-center gap-1.5 pb-2.5 text-[0.8125rem]">
            <Checkbox id={currentId} checked={current} onCheckedChange={(checked) => setCurrent(checked === true)} />
            Current
          </label>
          <Button type="submit" variant="secondary" loading={saving} disabled={snapshot.academicYears.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Add term
          </Button>
        </form>
        {snapshot.academicYears.length === 0 ? (
          <p className="mt-2.5 mb-0 text-xs text-muted-foreground">Add an academic year first.</p>
        ) : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.terms.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No terms cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.terms.map((term) => (
            <li key={term.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">
                    {term.data.name} {term.data.current ? <span className="text-primary">&middot; Current</span> : null}
                  </p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
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
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Classes</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Campus" id={campusId} className="w-40">
            <Select value={campus} onValueChange={(value) => setCampus(value ?? "")}>
              <SelectTrigger id={campusId} className="w-full">
                <SelectValue placeholder="Select a campus" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.campuses.map((c) => (
                  <SelectItem key={c.entityId} value={c.entityId}>
                    {c.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Code" id={codeId} className="w-24">
            <Input id={codeId} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Name" id={nameId} className="w-32">
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Grade level" id={gradeId} hint="Optional" className="w-24">
            <Input id={gradeId} value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
          </Field>
          <Field label="Capacity" id={capacityId} hint="Optional" className="w-20">
            <Input id={capacityId} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={snapshot.campuses.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Add class
          </Button>
        </form>
        {snapshot.campuses.length === 0 ? <p className="mt-2.5 mb-0 text-xs text-muted-foreground">Add a campus first.</p> : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.classes.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No classes cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.classes.map((cls) => (
            <li key={cls.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">{cls.data.name}</p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
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
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Subjects</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Code" id={codeId} className="w-32">
            <Input id={codeId} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Name" id={nameId}>
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add subject
          </Button>
        </form>
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.subjects.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No subjects cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.subjects.map((subject) => (
            <li key={subject.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">{subject.data.name}</p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">{subject.data.code}</p>
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
