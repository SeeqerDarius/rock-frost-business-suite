"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Question editor fields for the teacher's add/edit dialog. Every control is
 * a native form element posting to saveQuestionAction; the only client-side
 * behavior is showing the fields that apply to the chosen question type.
 * The server re-validates everything (validateQuestionDefinition).
 */

const TYPES = [
  { value: "SINGLE_CHOICE", label: "Single choice (marked automatically)" },
  { value: "MULTI_SELECT", label: "Multiple select (marked automatically, all or nothing)" },
  { value: "TRUE_FALSE", label: "True or false (marked automatically)" },
  { value: "NUMERIC", label: "Numeric answer (marked automatically)" },
  { value: "SHORT_TEXT", label: "Short written answer (you mark it)" },
  { value: "ESSAY", label: "Essay (you mark it)" },
] as const;

const OPTION_IDS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export interface QuestionFieldDefaults {
  type: string;
  prompt: string;
  points: string;
  options: { id: string; label: string }[];
  correctOptionIds: string[];
  numericAnswer: string | null;
  numericTolerance: string | null;
  markingGuide: string | null;
}

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function QuestionFields({ defaults }: { defaults?: QuestionFieldDefaults }) {
  const id = useId();
  const [type, setType] = useState(defaults?.type ?? "SINGLE_CHOICE");
  const isChoice = type === "SINGLE_CHOICE" || type === "MULTI_SELECT";
  const labelById = new Map((defaults?.options ?? []).map((option, index) => [OPTION_IDS[index] ?? option.id, option.label]));
  // Stored option ids are re-lettered a..h in order, so map existing correct answers the same way.
  const correctByLetter = new Set((defaults?.options ?? []).flatMap((option, index) => (defaults?.correctOptionIds.includes(option.id) ? [OPTION_IDS[index]] : [])));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-type`}>Question type</Label>
        <select id={`${id}-type`} name="type" value={type} onChange={(event) => setType(event.target.value)} className={selectClass}>
          {TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-prompt`}>Question</Label>
        <Textarea id={`${id}-prompt`} name="prompt" required maxLength={5000} rows={3} defaultValue={defaults?.prompt} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-points`}>Points</Label>
        <Input id={`${id}-points`} name="points" type="number" min="0.01" max="1000" step="0.01" required defaultValue={defaults?.points ?? "1"} className="max-w-32" />
      </div>

      {isChoice ? (
        <fieldset className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Options</legend>
          <p className="text-xs text-muted-foreground">
            {type === "SINGLE_CHOICE" ? "Fill in at least two options and tick exactly one correct answer." : "Fill in at least two options and tick every correct answer. Students get full marks only for an exact match."}
          </p>
          {OPTION_IDS.map((letter, index) => (
            <div key={letter} className="flex items-center gap-2">
              <span className="w-5 text-sm font-medium uppercase text-muted-foreground" aria-hidden="true">{letter}</span>
              <Input name={`option_${letter}`} aria-label={`Option ${letter.toUpperCase()}`} maxLength={500} defaultValue={labelById.get(letter) ?? ""} placeholder={index < 2 ? "Required" : "Optional"} />
              <label className="flex shrink-0 items-center gap-1.5 text-xs">
                <input type="checkbox" name="correct" value={letter} defaultChecked={correctByLetter.has(letter)} className="size-4 accent-primary" />
                Correct
              </label>
            </div>
          ))}
        </fieldset>
      ) : null}

      {type === "TRUE_FALSE" ? (
        <fieldset className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Correct answer</legend>
          <div className="flex gap-4">
            {["true", "false"].map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="trueFalse" value={value} required defaultChecked={defaults?.correctOptionIds[0] === value} className="size-4 accent-primary" />
                {value === "true" ? "True" : "False"}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {type === "NUMERIC" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-answer`}>Expected answer</Label>
            <Input id={`${id}-answer`} name="numericAnswer" inputMode="decimal" required pattern="-?(\d+(\.\d+)?|\.\d+)" defaultValue={defaults?.numericAnswer ?? ""} aria-describedby={`${id}-answer-hint`} />
            <p id={`${id}-answer-hint`} className="text-xs text-muted-foreground">A plain number, for example 12.5.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-tolerance`}>Tolerance (plus or minus)</Label>
            <Input id={`${id}-tolerance`} name="numericTolerance" inputMode="decimal" pattern="\d+(\.\d+)?|\.\d+" defaultValue={defaults?.numericTolerance ?? "0"} aria-describedby={`${id}-tolerance-hint`} />
            <p id={`${id}-tolerance-hint`} className="text-xs text-muted-foreground">0 means the answer must match exactly. Students see this margin.</p>
          </div>
        </div>
      ) : null}

      {type === "SHORT_TEXT" || type === "ESSAY" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-guide`}>Marking guide (optional, never shown to students)</Label>
          <Textarea id={`${id}-guide`} name="markingGuide" maxLength={5000} rows={3} defaultValue={defaults?.markingGuide ?? ""} />
          <p className="text-xs text-muted-foreground">Written answers are never marked automatically. You award the points when you review each submission.</p>
        </div>
      ) : null}
    </div>
  );
}
