import { useEffect, useId, useState, type FormEvent } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createSchoolAdapter } from "@/modules/school/adapter";
import type { SchoolSnapshot } from "@/modules/school/school-data";
import type { SchoolGradingScaleBand } from "@/modules/school/types";
import { Field, ErrorText } from "@/components/form-fields";

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
    <section aria-labelledby="school-settings-heading" className="flex flex-col gap-6">
      <h2 id="school-settings-heading" className="m-0 text-[1.05rem] font-bold">
        Settings
      </h2>
      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2.5">
            <Field label="Campus" id={campusFieldId} className="w-40">
              <Select value={campus} onValueChange={(value) => setCampus(value ?? "")}>
                <SelectTrigger id={campusFieldId} className="w-full">
                  <SelectValue placeholder="Select a campus" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.campuses.map((c) => (
                    <SelectItem key={c.entityId} value={c.entityId}>{c.data.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Attendance close window (days)" id={closeDaysId} className="w-24">
              <Input id={closeDaysId} inputMode="numeric" value={attendanceCloseDays} onChange={(e) => setAttendanceCloseDays(e.target.value)} disabled={!campus} />
            </Field>
            <Field label="Receipt prefix" id={prefixId} className="w-24">
              <Input id={prefixId} value={receiptPrefix} onChange={(e) => setReceiptPrefix(e.target.value)} disabled={!campus} />
            </Field>
            <label htmlFor={rankingId} className="flex items-center gap-1.5 pb-2.5 text-[0.8125rem]">
              <Checkbox id={rankingId} checked={allowRanking} onCheckedChange={(checked) => setAllowRanking(checked === true)} disabled={!campus} />
              Allow ranking
            </label>
          </div>

          <div>
            <p className="mt-0 mb-2 text-[0.8125rem] font-semibold">Grading scale</p>
            {bands.length === 0 ? (
              <p className="mt-0 mb-2 text-xs text-muted-foreground">No grading bands yet. Marks recorded in Exams will keep any grade entered by hand.</p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              {bands.map((band, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    aria-label="Grade"
                    value={band.grade}
                    onChange={(e) => updateBand(index, { grade: e.target.value })}
                    className="w-[4.5rem]"
                    placeholder="A"
                  />
                  <Input
                    aria-label="Minimum percent"
                    inputMode="decimal"
                    value={band.min}
                    onChange={(e) => updateBand(index, { min: Number(e.target.value) })}
                    className="w-20"
                    placeholder="Min"
                  />
                  <Input
                    aria-label="Maximum percent"
                    inputMode="decimal"
                    value={band.max}
                    onChange={(e) => updateBand(index, { max: Number(e.target.value) })}
                    className="w-20"
                    placeholder="Max"
                  />
                  <Button type="button" variant="ghost" onClick={() => removeBand(index)} aria-label="Remove grading band">
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" onClick={addBand} disabled={!campus} className="mt-2">
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
