"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleOrganizationModule } from "../actions";

interface ModuleToggleProps {
  organizationId: string;
  moduleId: string;
  enabled: boolean;
}

export function ModuleToggle({ organizationId, moduleId, enabled: initialEnabled }: ModuleToggleProps) {
  // Local optimistic state — the server-rendered `enabled` prop only refreshes on a
  // full navigation, so without this a second click in the same page view would
  // re-derive its direction from a stale value instead of what's currently shown.
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        checked={enabled}
        disabled={isPending}
        onCheckedChange={(checked: boolean) => {
          setEnabled(checked);
          setError(null);
          const formData = new FormData();
          formData.set("organizationId", organizationId);
          formData.set("moduleId", moduleId);
          formData.set("enabled", String(checked));
          startTransition(async () => {
            const result = await toggleOrganizationModule(formData);
            if (!result.ok) {
              setEnabled(!checked);
              setError(result.error ?? "The module could not be changed.");
            }
          });
        }}
      />
      {error ? <p className="max-w-56 text-right text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
