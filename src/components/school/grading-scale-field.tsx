"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Structured editor for a campus grading scale.
 *
 * The School Settings page used to expose this as a single text input
 * labelled "Grading scale JSON", which is not something a school registrar
 * can be asked to type. This edits grade bands as rows and serialises them
 * into the hidden `gradingScaleText` field that
 * `upsertSchoolSettingsAction` already parses with `JSON.parse`, so the
 * Server Action contract is unchanged.
 *
 * Persisted shape: `[{ "grade": "A1", "min": 75, "max": 100, "remark": "Excellent" }, …]`.
 * Consumed by `resolveGradeFromScale()` in `src/modules/school/service.ts`,
 * which `recordSchoolExamResult()` and the exam broadsheet both use to
 * auto-derive a result's letter grade and remark from the student's campus
 * scale when they aren't explicitly supplied (an explicit grade/remark
 * always wins). `allowRanking` is consumed by
 * `getSchoolBroadsheet()` — see `docs/SCHOOL_PARENT_STUDENT_PORTAL.md`.
 */

interface Band {
  grade: string;
  min: string;
  max: string;
  remark: string;
}

/** The classic WAEC 9-point scale (WASSCE/BECE), the grading convention
 * most Ghanaian schools' terminal reports and broadsheets already use. */
const GHANA_WAEC_BANDS: Band[] = [
  { grade: "A1", min: "75", max: "100", remark: "Excellent" },
  { grade: "B2", min: "70", max: "74", remark: "Very Good" },
  { grade: "B3", min: "65", max: "69", remark: "Good" },
  { grade: "C4", min: "60", max: "64", remark: "Credit" },
  { grade: "C5", min: "55", max: "59", remark: "Credit" },
  { grade: "C6", min: "50", max: "54", remark: "Credit" },
  { grade: "D7", min: "45", max: "49", remark: "Pass" },
  { grade: "E8", min: "40", max: "44", remark: "Pass" },
  { grade: "F9", min: "0", max: "39", remark: "Fail" },
];

const GENERIC_AF_BANDS: Band[] = [
  { grade: "A", min: "80", max: "100", remark: "Excellent" },
  { grade: "B", min: "70", max: "79", remark: "Very Good" },
  { grade: "C", min: "60", max: "69", remark: "Good" },
  { grade: "D", min: "50", max: "59", remark: "Pass" },
  { grade: "F", min: "0", max: "49", remark: "Fail" },
];

function toBands(value: unknown): Band[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const grade = typeof row.grade === "string" ? row.grade : "";
    if (!grade) return [];
    return [{ grade, min: String(row.min ?? ""), max: String(row.max ?? ""), remark: typeof row.remark === "string" ? row.remark : "" }];
  });
}

function serialize(bands: Band[]) {
  const rows = bands
    .filter((band) => band.grade.trim() !== "")
    .map((band) => ({ grade: band.grade.trim(), min: Number(band.min), max: Number(band.max), remark: band.remark.trim() || undefined }))
    .filter((band) => Number.isFinite(band.min) && Number.isFinite(band.max));
  return rows.length === 0 ? "" : JSON.stringify(rows);
}

export function GradingScaleField({ value, disabled }: { value: unknown; disabled?: boolean }) {
  const fieldId = useId();
  const [bands, setBands] = useState<Band[]>(() => toBands(value));

  const update = (index: number, patch: Partial<Band>) =>
    setBands((current) => current.map((band, position) => (position === index ? { ...band, ...patch } : band)));

  return (
    <div className="space-y-3">
      <input type="hidden" name="gradingScaleText" value={serialize(bands)} />
      <div className="space-y-1">
        <p className="text-sm font-medium">Grading scale</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Grade bands used to convert marks into a letter grade and remark. Leave empty to keep using marks only.
        </p>
      </div>

      {bands.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">No grade bands defined.</p>
          {!disabled ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button type="button" size="sm" onClick={() => setBands(GHANA_WAEC_BANDS)}>
                Use the Ghana (WASSCE/BECE) 9-point scale
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setBands(GENERIC_AF_BANDS)}>
                Use a standard A–F scale
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2">
          {bands.map((band, index) => (
            <li key={index} className="grid grid-cols-[1fr_1fr_1fr_1.4fr_auto] items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-grade-${index}`} className="text-xs text-muted-foreground">Grade</Label>
                <Input id={`${fieldId}-grade-${index}`} value={band.grade} disabled={disabled} maxLength={4} onChange={(event) => update(index, { grade: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-min-${index}`} className="text-xs text-muted-foreground">Min %</Label>
                <Input id={`${fieldId}-min-${index}`} type="number" min="0" max="100" value={band.min} disabled={disabled} onChange={(event) => update(index, { min: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-max-${index}`} className="text-xs text-muted-foreground">Max %</Label>
                <Input id={`${fieldId}-max-${index}`} type="number" min="0" max="100" value={band.max} disabled={disabled} onChange={(event) => update(index, { max: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-remark-${index}`} className="text-xs text-muted-foreground">Remark</Label>
                <Input id={`${fieldId}-remark-${index}`} value={band.remark} disabled={disabled} maxLength={40} placeholder="e.g. Credit" onChange={(event) => update(index, { remark: event.target.value })} />
              </div>
              <Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`Remove grade ${band.grade || index + 1}`} onClick={() => setBands((current) => current.filter((_, position) => position !== index))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!disabled && bands.length > 0 ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setBands((current) => [...current, { grade: "", min: "", max: "", remark: "" }])}>
          <Plus />
          Add grade band
        </Button>
      ) : null}
    </div>
  );
}
