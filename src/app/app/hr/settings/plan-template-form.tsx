"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PlanActivityRow = { title: string; activityType: "TODO" | "EMAIL" | "CALL" | "MEETING" | "DOCUMENT"; dueDateOffsetDays: number; ownerRule: "EMPLOYEE" | "MANAGER" | "HR_MANAGER" | "UNASSIGNED" };

const ACTIVITY_TYPE_ITEMS: Record<string, string> = { TODO: "To-do", EMAIL: "Email", CALL: "Call", MEETING: "Meeting", DOCUMENT: "Document" };
const OWNER_RULE_ITEMS: Record<string, string> = { EMPLOYEE: "The employee", MANAGER: "Their manager", HR_MANAGER: "An HR manager", UNASSIGNED: "Unassigned" };

const EMPTY_ACTIVITY: PlanActivityRow = { title: "", activityType: "TODO", dueDateOffsetDays: 0, ownerRule: "UNASSIGNED" };

export function PlanTemplateForm({
  id,
  defaultKind,
  defaultName = "",
  defaultActivities,
  action,
}: {
  id?: string;
  defaultKind: "ONBOARDING" | "OFFBOARDING";
  defaultName?: string;
  defaultActivities?: PlanActivityRow[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [activities, setActivities] = useState<PlanActivityRow[]>(defaultActivities?.length ? defaultActivities : [EMPTY_ACTIVITY]);

  function updateActivity(index: number, patch: Partial<PlanActivityRow>) {
    setActivities((current) => current.map((activity, i) => (i === index ? { ...activity, ...patch } : activity)));
  }

  return (
    <form action={action} className="space-y-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="kind" value={defaultKind} />
      <input type="hidden" name="activitiesJson" value={JSON.stringify(activities)} />
      <div className="space-y-2">
        <Label htmlFor={`name-${id ?? "new"}`}>Template name</Label>
        <Input id={`name-${id ?? "new"}`} name="name" defaultValue={defaultName} required />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Activities</p>
        {activities.map((activity, index) => (
          <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <Input placeholder="Activity title" value={activity.title} onChange={(e) => updateActivity(index, { title: e.target.value })} required />
            <Select value={activity.activityType} onValueChange={(value) => updateActivity(index, { activityType: value as PlanActivityRow["activityType"] })} items={ACTIVITY_TYPE_ITEMS}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ACTIVITY_TYPE_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" placeholder="Days offset" value={activity.dueDateOffsetDays} onChange={(e) => updateActivity(index, { dueDateOffsetDays: Number(e.target.value) })} />
            <Select value={activity.ownerRule} onValueChange={(value) => updateActivity(index, { ownerRule: value as PlanActivityRow["ownerRule"] })} items={OWNER_RULE_ITEMS}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(OWNER_RULE_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="button" size="sm" variant="ghost" disabled={activities.length === 1} onClick={() => setActivities((current) => current.filter((_, i) => i !== index))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setActivities((current) => [...current, EMPTY_ACTIVITY])}>
          <Plus />Add activity
        </Button>
      </div>

      <Button type="submit" className="w-full">{id ? "Save changes" : "Create template"}</Button>
    </form>
  );
}
