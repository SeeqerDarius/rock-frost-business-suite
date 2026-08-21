"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ReturnFields({ lines }: { lines: Array<{ id: string; description: string; remaining: number }> }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const selected = lines.flatMap((line) => quantities[line.id] > 0 ? [{ saleLineId: line.id, quantity: quantities[line.id] }] : []);
  return <>
    <input type="hidden" name="lines" value={JSON.stringify(selected)} />
    <div className="max-h-64 space-y-2 overflow-y-auto">{lines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_7rem] items-end gap-3 rounded-md border p-2"><div><p className="text-sm font-medium">{line.description}</p><p className="text-xs text-muted-foreground">Up to {line.remaining} remaining</p></div><div><Label htmlFor={`return-${line.id}`}>Return qty</Label><Input id={`return-${line.id}`} type="number" min={0} max={line.remaining} value={quantities[line.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: Number(event.target.value) }))} /></div></div>)}</div>
  </>;
}
