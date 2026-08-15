"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { generateDesktopActivationCode, type ActivationCodeState } from "./actions";

const initialState: ActivationCodeState = {};

export function ActivationCodeForm({ modules }: { modules: { key: string; label: string }[] }) {
  const [state, action, pending] = useActionState(generateDesktopActivationCode, initialState);
  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Modules available on this device</legend>
        {modules.map((module) => (
          <label key={module.key} className="flex items-center gap-3 text-sm">
            <input name="moduleKeys" type="checkbox" value={module.key} defaultChecked className="size-4" />
            {module.label}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending}>{pending ? "Creating code..." : "Create activation code"}</Button>
      {state.error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p> : null}
      {state.code ? (
        <div className="rounded-lg border bg-muted/30 p-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">Enter this single-use code in the desktop application within 10 minutes.</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-widest">{state.code}</p>
        </div>
      ) : null}
    </form>
  );
}
