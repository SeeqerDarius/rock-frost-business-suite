import { useEffect, useId, useState, type FormEvent } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import type { SchoolGradingScaleBand } from "@/modules/school/types";
import { Field, inputStyle, selectStyle, ErrorText } from "@/components/form-fields";

/** Settings is School's own per-campus UPDATE screen, mirroring PosSettingsScreen's baseVersion pattern - see SchoolStudentsScreen's status-transition control for the other established UPDATE example. */
export function SchoolSettingsScreen({ snapshot, onChanged }: { snapshot: SchoolSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const campusFieldId = useId();
  const closeDaysId = useId();
  const prefixId = useId();
  const rankingId = useId();
  const [campus, setCampus] = useState("");
  const [attendanceCloseDays, setAttendanceCloseDays] = useState("7");
  const [receiptPrefix, setReceiptPrefix] = useState("SCH");
  const [allowRanking, setAllowRanking] = useState(false);
  const [bands, setBands] = useState<SchoolGradingScaleBand[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const existing = snapshot.settings.find((s) => s.entityId === campus);

  useEffect(() => {
    if (!existing) {
      setAttendanceCloseDays("7");
      setReceiptPrefix("SCH");
      setAllowRanking(false);
      setBands([]);
      return;
    }
    setAttendanceCloseDays(String(existing.data.attendanceCloseDays));
    setReceiptPrefix(existing.data.receiptPrefix);
    setAllowRanking(existing.data.allowRanking);
    setBands(existing.data.gradingScale ?? []);
    // Only re-sync the form from the cached row when the selected campus
    // itself changes, not on every snapshot refresh - a refresh mid-edit
    // (e.g. after a background sync) should not silently discard the
    // fields the user is still typing into.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus]);

  function updateBand(index: number, patch: Partial<SchoolGradingScaleBand>) {
    setBands((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function removeBand(index: number) {
    setBands((prev) => prev.filter((_, i) => i !== index));
  }

  function addBand() {
    setBands((prev) => [...prev, { grade: "", min: 0, max: 100 }]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!device || !campus) return;
    const closeDays = Number(attendanceCloseDays);
    if (!Number.isInteger(closeDays) || closeDays < 0 || closeDays > 365 || !receiptPrefix.trim()) {
      setError("Enter a valid attendance close window (0-365 days) and a receipt prefix.");
      return;
    }
    const cleanedBands = bands.filter((b) => b.grade.trim());
    if (cleanedBands.some((b) => !Number.isFinite(b.min) || !Number.isFinite(b.max) || b.min > b.max)) {
      setError("Each grading band needs a valid min/max range.");
      return;
    }
    setError(null);
    setSaving(true);
    recordActivity();
    try {
      await createSchoolAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName }).updateSettings(
        campus,
        {
          attendanceCloseDays: closeDays,
          receiptPrefix: receiptPrefix.trim(),
          allowRanking,
          gradingScale: cleanedBands.length > 0 ? cleanedBands : null,
        },
        existing?.version ?? 0,
      );
      await onChanged();
    } catch {
      setError("Could not queue these settings. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="school-settings-heading" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h2 id="school-settings-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Settings
      </h2>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "end", flexWrap: "wrap" }}>
            <Field label="Campus" id={campusFieldId}>
              <select id={campusFieldId} value={campus} onChange={(e) => setCampus(e.target.value)} style={{ ...selectStyle, width: "10rem" }}>
                <option value="">Select a campus</option>
                {snapshot.campuses.map((c) => (
                  <option key={c.entityId} value={c.entityId}>{c.data.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Attendance close window (days)" id={closeDaysId}>
              <input id={closeDaysId} inputMode="numeric" value={attendanceCloseDays} onChange={(e) => setAttendanceCloseDays(e.target.value)} style={{ ...inputStyle, width: "6rem" }} disabled={!campus} />
            </Field>
            <Field label="Receipt prefix" id={prefixId}>
              <input id={prefixId} value={receiptPrefix} onChange={(e) => setReceiptPrefix(e.target.value)} style={{ ...inputStyle, width: "6rem" }} disabled={!campus} />
            </Field>
            <label htmlFor={rankingId} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", paddingBottom: "0.6rem" }}>
              <input id={rankingId} type="checkbox" checked={allowRanking} onChange={(e) => setAllowRanking(e.target.checked)} disabled={!campus} />
              Allow ranking
            </label>
          </div>

          <div>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", fontWeight: 600 }}>Grading scale</p>
            {bands.length === 0 ? (
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>No grading bands yet. Marks recorded in Exams will keep any grade entered by hand.</p>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {bands.map((band, index) => (
                <div key={index} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    aria-label="Grade"
                    value={band.grade}
                    onChange={(e) => updateBand(index, { grade: e.target.value })}
                    style={{ ...inputStyle, width: "4.5rem" }}
                    placeholder="A"
                  />
                  <input
                    aria-label="Minimum percent"
                    inputMode="decimal"
                    value={band.min}
                    onChange={(e) => updateBand(index, { min: Number(e.target.value) })}
                    style={{ ...inputStyle, width: "5rem" }}
                    placeholder="Min"
                  />
                  <input
                    aria-label="Maximum percent"
                    inputMode="decimal"
                    value={band.max}
                    onChange={(e) => updateBand(index, { max: Number(e.target.value) })}
                    style={{ ...inputStyle, width: "5rem" }}
                    placeholder="Max"
                  />
                  <Button type="button" variant="ghost" onClick={() => removeBand(index)} aria-label="Remove grading band">
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" onClick={addBand} disabled={!campus} style={{ marginTop: "0.5rem" }}>
              <Plus size={14} aria-hidden="true" />
              Add band
            </Button>
          </div>

          <div>
            <Button type="submit" loading={saving} disabled={!campus}>
              <Save size={14} aria-hidden="true" />
              Save settings
            </Button>
          </div>
          {error ? <ErrorText>{error}</ErrorText> : null}
        </form>
      </Card>
    </section>
  );
}
