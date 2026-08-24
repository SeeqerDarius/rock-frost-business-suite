"use client";

import { useMemo, useState, useTransition } from "react";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { previewLaunchPlan, launchEmployeePlan, type PlanPreviewResult } from "./actions";

export type LaunchPlanTemplate = { id: string; kind: "ONBOARDING" | "OFFBOARDING"; name: string };

const ACTIVITY_TYPE_LABEL: Record<string, string> = { TODO: "To-do", EMAIL: "Email", CALL: "Call", MEETING: "Meeting", DOCUMENT: "Document" };

export function LaunchPlanDialog({
  employeeId,
  defaultKind,
  defaultTargetDate,
  templates,
}: {
  employeeId: string;
  defaultKind: "ONBOARDING" | "OFFBOARDING";
  defaultTargetDate: string;
  templates: LaunchPlanTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"ONBOARDING" | "OFFBOARDING">(defaultKind);
  const [targetDate, setTargetDate] = useState(defaultTargetDate);
  const [templateId, setTemplateId] = useState("");
  const [preview, setPreview] = useState<PlanPreviewResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const templatesForKind = useMemo(() => templates.filter((t) => t.kind === kind), [templates, kind]);

  function runPreview() {
    if (!templateId) return;
    const formData = new FormData();
    formData.set("employeeId", employeeId);
    formData.set("templateId", templateId);
    formData.set("targetDate", targetDate);
    startTransition(async () => {
      setPreview(await previewLaunchPlan(formData));
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) { setPreview(null); setTemplateId(""); }
      }}
    >
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}><Rocket />Launch plan</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Launch a plan</DialogTitle>
          <DialogDescription>Generate a dated, owner-assigned checklist from an onboarding or offboarding template.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={kind === "ONBOARDING" ? "default" : "outline"} onClick={() => { setKind("ONBOARDING"); setTemplateId(""); setPreview(null); }}>Onboarding</Button>
            <Button type="button" size="sm" variant={kind === "OFFBOARDING" ? "default" : "outline"} onClick={() => { setKind("OFFBOARDING"); setTemplateId(""); setPreview(null); }}>Offboarding</Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="launch-target-date">Target date</Label>
            <Input id="launch-target-date" type="date" value={targetDate} onChange={(e) => { setTargetDate(e.target.value); setPreview(null); }} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="launch-template">Template</Label>
            {templatesForKind.length === 0 ? (
              <p className="text-sm text-muted-foreground">No {kind.toLowerCase()} templates configured. Set one up in HR Settings.</p>
            ) : (
              <Select value={templateId} onValueChange={(value) => { setTemplateId(String(value)); setPreview(null); }} items={Object.fromEntries(templatesForKind.map((t) => [t.id, t.name]))}>
                <SelectTrigger id="launch-template" className="w-full"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                <SelectContent>{templatesForKind.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>

          {templateId ? <Button type="button" size="sm" variant="outline" onClick={runPreview} disabled={isPending}>{isPending ? "Loading..." : "Preview"}</Button> : null}

          {preview && !preview.ok ? <p className="text-sm text-destructive" role="alert">{preview.error}</p> : null}
          {preview && preview.ok ? (
            <ul className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2 text-sm">
              {preview.activities.map((activity, index) => (
                <li key={index} className="flex items-center justify-between gap-2">
                  <span>{activity.title} <span className="text-xs text-muted-foreground">({ACTIVITY_TYPE_LABEL[activity.activityType] ?? activity.activityType})</span></span>
                  <span className="text-right text-xs text-muted-foreground">
                    {new Date(activity.dueDate).toLocaleDateString()}
                    {!activity.ownerId ? <span className="block text-amber-600 dark:text-amber-400">No user to assign</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <form id="launch-plan-form" action={launchEmployeePlan}>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="targetDate" value={targetDate} />
        </form>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" form="launch-plan-form" disabled={!preview?.ok}>Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
