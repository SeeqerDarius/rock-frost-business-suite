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

export function SchoolTransportScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-transport-heading" className="flex flex-col gap-6">
      <h2 id="school-transport-heading" className="m-0 text-[1.05rem] font-bold">
        Transport
      </h2>
      <RouteSection snapshot={snapshot} onChanged={onChanged} />
      <AssignmentSection snapshot={snapshot} onChanged={onChanged} />
    </section>
  );
}

function RouteSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const campusId = useId();
  const codeId = useId();
  const nameId = useId();
  const vehicleId = useId();
  const driverId = useId();
  const feeId = useId();
  const [campus, setCampus] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [driverName, setDriverName] = useState("");
  const [fee, setFee] = useState("0.00");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    const feeValue = Number(fee);
    if (!campus || !code.trim() || !name.trim() || !Number.isFinite(feeValue) || feeValue < 0) {
      setError("Select a campus, enter a code and name, and a fee of 0 or more.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).createTransportRoute(crypto.randomUUID(), {
        campusId: campus,
        code: code.trim(),
        name: name.trim(),
        vehicle: vehicle.trim() || null,
        driverName: driverName.trim() || null,
        fee: feeValue,
      });
      setCode("");
      setName("");
      setVehicle("");
      setDriverName("");
      setFee("0.00");
      await onChanged();
    } catch {
      setError("Could not queue this route. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Routes</p>
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
          <Field label="Code" id={codeId} className="w-24">
            <Input id={codeId} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Name" id={nameId} className="w-36">
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Vehicle" id={vehicleId} hint="Optional" className="w-28">
            <Input id={vehicleId} value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
          </Field>
          <Field label="Driver" id={driverId} hint="Optional" className="w-32">
            <Input id={driverId} value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </Field>
          <Field label="Fee" id={feeId} className="w-[5.5rem]">
            <Input id={feeId} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add route
          </Button>
        </form>
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.transportRoutes.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No transport routes cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.transportRoutes.map((route) => (
            <li key={route.entityId}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">{route.data.name}</p>
                  <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
                    {route.data.code} &middot; {route.data.driverName ?? "No driver set"} &middot; {route.data.fee}
                  </p>
                </div>
                <SyncBadge pending={route.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssignmentSection({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const routeId = useId();
  const studentId = useId();
  const stopId = useId();
  const [route, setRoute] = useState("");
  const [student, setStudent] = useState("");
  const [stopName, setStopName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const eligibleRoutes = snapshot.transportRoutes.filter((r) => !r.hasPendingLocalChange);
  const eligibleStudents = snapshot.students.filter((s) => !s.hasPendingLocalChange && s.data.status === "ACTIVE");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device) return;
    if (!route || !student) {
      setError("Select a route and a student.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).assignTransport(crypto.randomUUID(), {
        routeId: route,
        studentId: student,
        stopName: stopName.trim() || null,
      });
      setStopName("");
      await onChanged();
    } catch {
      setError("Could not queue this assignment. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const nameForRoute = (id: string) => snapshot.transportRoutes.find((r) => r.entityId === id)?.data.name ?? id.slice(0, 8);
  const nameForStudent = (id: string) => {
    const row = snapshot.students.find((s) => s.entityId === id);
    return row ? `${row.data.firstName} ${row.data.lastName}` : id.slice(0, 8);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Assignments</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-wrap items-end gap-2.5">
          <Field label="Route" id={routeId} className="w-36">
            <Select value={route} onValueChange={(value) => setRoute(value ?? "")}>
              <SelectTrigger id={routeId} className="w-full">
                <SelectValue placeholder="Select a route" />
              </SelectTrigger>
              <SelectContent>
                {eligibleRoutes.map((r) => (
                  <SelectItem key={r.entityId} value={r.entityId}>{r.data.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Student" id={studentId} className="w-36">
            <Select value={student} onValueChange={(value) => setStudent(value ?? "")}>
              <SelectTrigger id={studentId} className="w-full">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {eligibleStudents.map((s) => (
                  <SelectItem key={s.entityId} value={s.entityId}>{s.data.firstName} {s.data.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Stop" id={stopId} hint="Optional" className="w-32">
            <Input id={stopId} value={stopName} onChange={(e) => setStopName(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={eligibleRoutes.length === 0 || eligibleStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Assign
          </Button>
        </form>
        {eligibleRoutes.length === 0 ? (
          <p className="mt-2.5 mb-0 text-xs text-muted-foreground">Needs an already-synced route. A route just added offline needs to sync first.</p>
        ) : null}
        {error ? <div className="mt-2.5"><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.transportAssignments.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">No transport assignments cached on this device yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {snapshot.transportAssignments.map((assignment) => (
            <li key={assignment.entityId}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold">
                    {nameForStudent(assignment.data.studentId)} &middot; {nameForRoute(assignment.data.routeId)}
                  </p>
                  {assignment.data.stopName ? (
                    <p className="mt-0.5 mb-0 text-xs text-muted-foreground">{assignment.data.stopName}</p>
                  ) : null}
                </div>
                <SyncBadge pending={assignment.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
