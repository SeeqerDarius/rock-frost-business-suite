"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ItemOption = { id: string; label: string };
type RequestLine = { key: string; itemId: string; description: string; quantity: string; estimatedCost: string };

const blankLine = (key: string): RequestLine => ({ key, itemId: "", description: "", quantity: "1", estimatedCost: "" });

export function RequestLinesField({ items, currency }: { items: ItemOption[]; currency: string }) {
  const [lines, setLines] = useState<RequestLine[]>([blankLine("line-1")]);
  const serialized = useMemo(() => JSON.stringify(lines.map(({ itemId, description, quantity, estimatedCost }) => ({ itemId: itemId || null, description, quantity, estimatedCost: estimatedCost || null }))), [lines]);

  function change(key: string, field: keyof Omit<RequestLine, "key">, value: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  return <div className="space-y-3">
    <input type="hidden" name="linesJson" value={serialized} />
    {lines.map((line, index) => <div key={line.key} className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between"><p className="text-sm font-medium">Line {index + 1}</p>{lines.length > 1 ? <Button type="button" size="sm" variant="ghost" onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}>Remove</Button> : null}</div>
      <div className="space-y-2"><Label htmlFor={`description-${line.key}`}>Description</Label><Input id={`description-${line.key}`} value={line.description} onChange={(event) => change(line.key, "description", event.target.value)} required /></div>
      <div className="space-y-2"><Label htmlFor={`item-${line.key}`}>Inventory item (optional)</Label><select id={`item-${line.key}`} value={line.itemId} onChange={(event) => change(line.key, "itemId", event.target.value)} className="h-10 w-full rounded-md border bg-background px-3"><option value="">None</option>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`quantity-${line.key}`}>Quantity</Label><Input id={`quantity-${line.key}`} type="number" min="1" step="1" value={line.quantity} onChange={(event) => change(line.key, "quantity", event.target.value)} required /></div><div className="space-y-2"><Label htmlFor={`cost-${line.key}`}>Estimated line cost ({currency})</Label><Input id={`cost-${line.key}`} type="number" min="0" step="0.01" value={line.estimatedCost} onChange={(event) => change(line.key, "estimatedCost", event.target.value)} /></div></div>
    </div>)}
    <Button type="button" variant="outline" size="sm" disabled={lines.length >= 50} onClick={() => setLines((current) => [...current, blankLine(`line-${Date.now()}-${current.length}`)])}>Add another line</Button>
  </div>;
}
