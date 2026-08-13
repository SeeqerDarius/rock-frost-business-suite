"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Option = { id: string; name: string; moduleKey: string; monthlyGhs: number; annualGhs: number; includedSeats: number };

export function SubscriptionQuoteFields({ modules }: { modules: Option[] }) {
  const [moduleId, setModuleId] = useState("");
  const [duration, setDuration] = useState(12);
  const selected = modules.find((module) => module.id === moduleId);
  const amount = selected ? (duration === 12 ? selected.annualGhs : selected.monthlyGhs * duration) : "";

  return <>
    <div><Label htmlFor="moduleId">Module</Label><select id="moduleId" name="moduleId" required value={moduleId} onChange={(event) => setModuleId(event.target.value)} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="" disabled>Select…</option>{modules.map((module) => <option key={module.id} value={module.id}>{module.name} · GHS {module.monthlyGhs}/month</option>)}</select></div>
    <div><Label htmlFor="durationMonths">Duration (months)</Label><Input id="durationMonths" name="durationMonths" type="number" min="1" max="120" value={duration} onChange={(event) => setDuration(Number(event.target.value))} required /></div>
    <div><Label htmlFor="seatLimit">User seats</Label><Input key={`${moduleId}-seats`} id="seatLimit" name="seatLimit" type="number" min="1" max="100000" defaultValue={selected?.includedSeats ?? 5} required /></div>
    <div><Label htmlFor="amount">Agreed amount</Label><Input key={`${moduleId}-${duration}-amount`} id="amount" name="amount" type="number" min="0" step="0.01" defaultValue={amount} required /><p className="mt-1 text-xs text-muted-foreground">Catalogue recommendation; operators may adjust negotiated agreements.</p></div>
  </>;
}
