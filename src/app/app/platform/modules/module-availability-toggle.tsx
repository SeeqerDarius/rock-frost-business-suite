"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleModuleAvailability } from "./actions";

interface ModuleAvailabilityToggleProps {
  moduleId: string;
  available: boolean;
}

export function ModuleAvailabilityToggle({ moduleId, available: initialAvailable }: ModuleAvailabilityToggleProps) {
  // Local optimistic state, matching ModuleToggle's own reasoning: the
  // server-rendered `available` prop only refreshes on a full navigation.
  const [available, setAvailable] = useState(initialAvailable);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        checked={available}
        disabled={isPending}
        aria-label={available ? "Mark unavailable" : "Mark available"}
        onCheckedChange={(checked: boolean) => {
          setAvailable(checked);
          setError(null);
          const formData = new FormData();
          formData.set("moduleId", moduleId);
          formData.set("available", String(checked));
          startTransition(async () => {
            const result = await toggleModuleAvailability(formData);
            if (!result.ok) {
              setAvailable(!checked);
              setError(result.error ?? "Availability could not be changed.");
            }
          });
        }}
      />
      {error ? <p className="max-w-40 text-right text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
