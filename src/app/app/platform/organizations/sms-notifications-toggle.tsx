"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleOrganizationSmsNotifications } from "../actions";

interface SmsNotificationsToggleProps {
  organizationId: string;
  granted: boolean;
}

export function SmsNotificationsToggle({ organizationId, granted: initialGranted }: SmsNotificationsToggleProps) {
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
            const result = await toggleOrganizationSmsNotifications(formData);
            if (!result.ok) {
              setGranted(!checked);
              setError(result.error ?? "SMS notifications could not be changed.");
            }
          });
        }}
      />
      {error ? <p className="max-w-56 text-right text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
