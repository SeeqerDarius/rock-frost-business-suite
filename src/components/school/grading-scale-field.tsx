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
 * Persisted shape: `[{ "grade": "A", "min": 80, "max": 100 }, …]`.
 * Nothing reads this value back yet — see
 * docs/SCHOOL_UI_CUSTOMER_READINESS.md.
 */

interface Band {
  grade: string;
  min: string;
  max: string;
}

const DEFAULT_BANDS: Band[] = [
  { grade: "A", min: "80", max: "100" },
  { grade: "B", min: "70", max: "79" },
  { grade: "C", min: "60", max: "69" },
  { grade: "D", min: "50", max: "59" },
  { grade: "F", min: "0", max: "49" },
];

function toBands(value: unknown): Band[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const grade = typeof row.grade === "string" ? row.grade : "";
    if (!grade) return [];
    return [{ grade, min: String(row.min ?? ""), max: String(row.max ?? "") }];
  });
}

function serialize(bands: Band[]) {
  const rows = bands
    .filter((band) => band.grade.trim() !== "")
    .map((band) => ({ grade: band.grade.trim(), min: Number(band.min), max: Number(band.max) }))
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
          Grade bands used when marks are converted to letter grades. Leave empty to keep using marks only.
        </p>
      </div>

      {bands.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">No grade bands defined.</p>
          {!disabled ? (
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setBands(DEFAULT_BANDS)}>
              Use a standard A–F scale
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2">
          {bands.map((band, index) => (
            <li key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
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
              <Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`Remove grade ${band.grade || index + 1}`} onClick={() => setBands((current) => current.filter((_, position) => position !== index))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!disabled && bands.length > 0 ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setBands((current) => [...current, { grade: "", min: "", max: "" }])}>
          <Plus />
          Add grade band
        </Button>
      ) : null}
    </div>
  );
}
