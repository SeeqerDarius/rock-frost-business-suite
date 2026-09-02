"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleOrganizationOfflineAccess } from "../actions";

interface OfflineAccessToggleProps {
  organizationId: string;
  granted: boolean;
}

export function OfflineAccessToggle({ organizationId, granted: initialGranted }: OfflineAccessToggleProps) {
  // Local optimistic state, matching ModuleToggle's own reasoning: the
  // server-rendered `granted` prop only refreshes on a full navigation.
  const [granted, setGranted] = useState(initialGranted);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        checked={granted}
        disabled={isPending}
        onCheckedChange={(checked: boolean) => {
          setGranted(checked);
          setError(null);
          const formData = new FormData();
          formData.set("organizationId", organizationId);
          formData.set("granted", String(checked));
          startTransition(async () => {
            const result = await toggleOrganizationOfflineAccess(formData);
            if (!result.ok) {
              setGranted(!checked);
              setError(result.error ?? "Offline access could not be changed.");
            }
          });
        }}
      />
      {error ? <p className="max-w-56 text-right text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
