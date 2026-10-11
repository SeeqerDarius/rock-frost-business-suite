"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toggleOrganizationModule } from "../../../../actions";
import { setOrganizationFeatureAction } from "./actions";

type Target =
  | { kind: "module"; organizationId: string; moduleId: string }
  | { kind: "feature"; organizationId: string; moduleKey: string; featureKey: string };

type Status = { state: "idle" } | { state: "pending" } | { state: "saved"; value: boolean } | { state: "failed"; message: string };

/**
 * A switch for a consequential, organization-wide change. Flipping it opens a
 * confirmation that states what will happen; nothing is sent until the
 * operator confirms. The server re-checks permissions, dependencies, and that
 * the value is still what this page showed (`expected`), so a stale page can
 * never overwrite someone else's change. The visible value only changes once
 * the server has saved it.
 */
export function ConfirmedSwitch({
  target,
  label,
  value: initialValue,
  turnOnConsequence,
  turnOffConsequence,
  blockedReason,
}: {
  target: Target;
  label: string;
  value: boolean;
  turnOnConsequence: string;
  turnOffConsequence: string;
  /** When set, the switch is disabled and the reason is shown next to it. */
  blockedReason?: string | null;
}) {
  const router = useRouter();
  const statusId = useId();
  const [value, setValue] = useState(initialValue);
  const [proposed, setProposed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [isPending, startTransition] = useTransition();

  const confirm = () => {
    if (proposed === null) return;
    const next = proposed;
    setProposed(null);
    setStatus({ state: "pending" });
    const formData = new FormData();
    formData.set("organizationId", target.organizationId);
    formData.set("enabled", String(next));
    formData.set("expected", String(value));
    startTransition(async () => {
      if (target.kind === "module") {
        formData.set("moduleId", target.moduleId);
        const result = await toggleOrganizationModule(formData);
        if (!result.ok) {
          setStatus({ state: "failed", message: result.error ?? "The module could not be changed." });
          return;
        }
        setValue(next);
        setStatus({ state: "saved", value: next });
      } else {
        formData.set("moduleKey", target.moduleKey);
        formData.set("featureKey", target.featureKey);
        const result = await setOrganizationFeatureAction(formData);
        if (!result.ok) {
          setStatus({ state: "failed", message: result.error });
          return;
        }
        setValue(result.value);
        setStatus({ state: "saved", value: result.value });
      }
      // Refresh dependent rows (other features' blocked reasons, statuses).
      router.refresh();
    });
  };

  const busy = isPending || status.state === "pending";
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center gap-2">
        {busy ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
        <span className="text-xs text-muted-foreground" aria-hidden="true">{value ? "On" : "Off"}</span>
        <Switch
          aria-label={`${label}: ${value ? "on" : "off"}`}
          aria-describedby={statusId}
          checked={value}
          disabled={busy || Boolean(blockedReason)}
          onCheckedChange={(checked: boolean) => {
            setStatus({ state: "idle" });
            setProposed(checked);
          }}
        />
      </div>
      <p id={statusId} aria-live="polite" className="max-w-72 text-xs sm:text-right">
        {blockedReason ? <span className="text-muted-foreground">{blockedReason}</span> : null}
        {status.state === "pending" ? <span className="text-muted-foreground">Saving…</span> : null}
        {status.state === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3.5" aria-hidden="true" />Saved. {label} is {status.value ? "on" : "off"}.</span> : null}
        {status.state === "failed" ? <span role="alert" className="inline-flex items-start gap-1 text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Not saved. {status.message}</span> : null}
      </p>

      <Dialog open={proposed !== null} onOpenChange={(open) => { if (!open) setProposed(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{proposed ? `Turn on ${label}?` : `Turn off ${label}?`}</DialogTitle>
            <DialogDescription>{proposed ? turnOnConsequence : turnOffConsequence}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProposed(null)}>Cancel</Button>
            <Button type="button" variant={proposed ? "default" : "destructive"} onClick={confirm}>{proposed ? "Turn on" : "Turn off"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
