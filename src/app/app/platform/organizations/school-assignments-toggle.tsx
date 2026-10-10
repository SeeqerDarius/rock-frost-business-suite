"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleSchoolAssignments } from "../actions";

interface SchoolAssignmentsToggleProps {
  organizationId: string;
  granted: boolean;
}

export function SchoolAssignmentsToggle({ organizationId, granted: initialGranted }: SchoolAssignmentsToggleProps) {
  const [granted, setGranted] = useState(initialGranted);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        aria-label="Assignments & Assessments"
        checked={granted}
        disabled={isPending}
        onCheckedChange={(checked: boolean) => {
          setGranted(checked);
          setError(null);
          const formData = new FormData();
          formData.set("organizationId", organizationId);
          formData.set("granted", String(checked));
          startTransition(async () => {
            const result = await toggleSchoolAssignments(formData);
            if (!result.ok) {
              setGranted(!checked);
              setError(result.error ?? "Assignments & Assessments could not be changed.");
            }
          });
        }}
      />
      {error ? <p className="max-w-56 text-right text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
