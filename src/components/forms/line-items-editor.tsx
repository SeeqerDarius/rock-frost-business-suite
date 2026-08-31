"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface LineItemRow {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface LineItemsEditorProps {
  currency: string;
  initialLines?: LineItemRow[];
}

const EMPTY_ROW: LineItemRow = { description: "", quantity: "1", unitPrice: "" };

/**
 * A dynamic add/remove line-item editor shared by Invoices, Bills, and
 * Credit Notes - each row submits as `lines[{index}][description|quantity|
 * unitPrice]` inside the surrounding form's own FormData, parsed back out
 * by parseLineItems() in src/modules/accounting/service.ts. No client-side
 * validation beyond input types/required - the server recomputes and
 * validates every line total itself, this editor's running total is purely
 * a convenience preview.
 */
export function LineItemsEditor({ currency, initialLines }: LineItemsEditorProps) {
  const [lines, setLines] = useState<LineItemRow[]>(initialLines?.length ? initialLines : [EMPTY_ROW]);
  const idPrefix = useId();

  const updateLine = (index: number, field: keyof LineItemRow, value: string) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };
  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_ROW }]);
  const removeLine = (index: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_4.5rem_5.5rem_2rem] gap-2 text-xs text-muted-foreground">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit price</span>
        <span />
      </div>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={`${idPrefix}-${index}`} className="grid grid-cols-[1fr_4.5rem_5.5rem_2rem] items-center gap-2">
            <Input
              name={`lines[${index}][description]`}
              value={line.description}
              onChange={(event) => updateLine(index, "description", event.target.value)}
              placeholder="e.g. Consulting services"
              required
            />
            <Input
              name={`lines[${index}][quantity]`}
              type="number"
              step="0.01"
              min="0.01"
              value={line.quantity}
              onChange={(event) => updateLine(index, "quantity", event.target.value)}
              required
            />
            <Input
              name={`lines[${index}][unitPrice]`}
              type="number"
              step="0.01"
              min="0"
              value={line.unitPrice}
              onChange={(event) => updateLine(index, "unitPrice", event.target.value)}
              required
            />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeLine(index)} disabled={lines.length === 1} aria-label={`Remove line ${index + 1}`}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button type="button" size="sm" variant="outline" onClick={addLine}>
          <Plus />
          Add line
        </Button>
        <p className="text-sm text-muted-foreground">
          Taxable total: {currency} {total.toFixed(2)}
        </p>
      </div>
    </div>
  );
}
