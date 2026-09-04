"use client";

import { useState } from "react";
import { FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { cn } from "@/lib/utils";

export function StudentGuardianFields({ guardianOptions }: { guardianOptions: { value: string; label: string }[] }) {
  const [mode, setMode] = useState<"new" | "existing">(guardianOptions.length > 0 ? "existing" : "new");

  return (
    <fieldset className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <legend className="px-1 text-sm font-semibold">Primary guardian</legend>
      <input type="hidden" name="guardianMode" value={mode} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Link an existing guardian or create one here. The student and guardian are saved together in one step.
      </p>
      {guardianOptions.length > 0 ? (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Guardian record choice">
          {(["existing", "new"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={mode === choice}
              onClick={() => setMode(choice)}
              className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === choice ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {choice === "existing" ? "Select existing" : "Create new"}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "existing" ? (
        <>
          <SelectField id="student-existing-guardian" name="existingGuardianId" label="Guardian" required options={guardianOptions} placeholder="Choose a guardian…" />
          <TextField id="student-existing-guardian-relationship" name="guardianRelationship" label="Relationship to student" placeholder="Mother, Father, Aunt…" required maxLength={200} />
        </>
      ) : (
        <>
          <FieldGrid>
            <TextField id="student-guardian-first-name" name="guardianFirstName" label="Guardian first name" required maxLength={200} />
            <TextField id="student-guardian-last-name" name="guardianLastName" label="Guardian last name" required maxLength={200} />
          </FieldGrid>
          <FieldGrid>
            <TextField id="student-guardian-phone" name="guardianPhone" label="Guardian phone" type="tel" required maxLength={200} />
            <TextField id="student-new-guardian-relationship" name="guardianRelationship" label="Relationship to student" placeholder="Mother, Father, Aunt…" required maxLength={200} />
          </FieldGrid>
          <FieldGrid>
            <TextField id="student-guardian-email" name="guardianEmail" label="Guardian email" type="email" hint="Optional." />
            <TextField id="student-guardian-occupation" name="guardianOccupation" label="Guardian occupation" maxLength={200} hint="Optional." />
          </FieldGrid>
          <TextField id="student-guardian-address" name="guardianAddress" label="Guardian address" hint="Optional." />
        </>
      )}
    </fieldset>
  );
}
