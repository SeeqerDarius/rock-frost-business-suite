import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import { Field, inputStyle, selectStyle, ErrorText, SyncBadge } from "@/components/form-fields";

export function SchoolTransportScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="school-transport-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 id="school-transport-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Routes</p>
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
          <Field label="Code" id={codeId}>
            <input id={codeId} value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, width: "6rem" }} />
          </Field>
          <Field label="Name" id={nameId}>
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: "9rem" }} />
          </Field>
          <Field label="Vehicle" id={vehicleId} hint="Optional">
            <input id={vehicleId} value={vehicle} onChange={(e) => setVehicle(e.target.value)} style={{ ...inputStyle, width: "7rem" }} />
          </Field>
          <Field label="Driver" id={driverId} hint="Optional">
            <input id={driverId} value={driverName} onChange={(e) => setDriverName(e.target.value)} style={{ ...inputStyle, width: "8rem" }} />
          </Field>
          <Field label="Fee" id={feeId}>
            <input id={feeId} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} style={{ ...inputStyle, width: "5.5rem" }} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Plus size={14} aria-hidden="true" />
            Add route
          </Button>
        </form>
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.transportRoutes.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No transport routes cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.transportRoutes.map((route) => (
            <li key={route.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>{route.data.name}</p>
                  <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Assignments</p>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Route" id={routeId}>
            <select id={routeId} value={route} onChange={(e) => setRoute(e.target.value)} style={{ ...selectStyle, width: "9rem" }}>
              <option value="">Select a route</option>
              {eligibleRoutes.map((r) => (
                <option key={r.entityId} value={r.entityId}>{r.data.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Student" id={studentId}>
            <select id={studentId} value={student} onChange={(e) => setStudent(e.target.value)} style={{ ...selectStyle, width: "9rem" }}>
              <option value="">Select a student</option>
              {eligibleStudents.map((s) => (
                <option key={s.entityId} value={s.entityId}>{s.data.firstName} {s.data.lastName}</option>
              ))}
            </select>
          </Field>
          <Field label="Stop" id={stopId} hint="Optional">
            <input id={stopId} value={stopName} onChange={(e) => setStopName(e.target.value)} style={{ ...inputStyle, width: "8rem" }} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving} disabled={eligibleRoutes.length === 0 || eligibleStudents.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Assign
          </Button>
        </form>
        {eligibleRoutes.length === 0 ? (
          <p style={{ margin: "0.6rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>Needs an already-synced route. A route just added offline needs to sync first.</p>
        ) : null}
        {error ? <div style={{ marginTop: "0.6rem" }}><ErrorText>{error}</ErrorText></div> : null}
      </Card>
      {snapshot.transportAssignments.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No transport assignments cached on this device yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {snapshot.transportAssignments.map((assignment) => (
            <li key={assignment.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
                    {nameForStudent(assignment.data.studentId)} &middot; {nameForRoute(assignment.data.routeId)}
                  </p>
                  {assignment.data.stopName ? (
                    <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>{assignment.data.stopName}</p>
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
