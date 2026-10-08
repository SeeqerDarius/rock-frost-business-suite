"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface LineItemRow {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRuleId?: string;
}

interface LineItemsEditorProps {
  currency: string;
  initialLines?: LineItemRow[];
  /** Tax engine rules a line can use instead of the document rule. Omitted or empty hides the per-line tax column. */
  taxRules?: { id: string; label: string }[];
}

const EMPTY_ROW: LineItemRow = { description: "", quantity: "1", unitPrice: "", taxRuleId: "" };

/**
 * A dynamic add/remove line-item editor shared by Invoices, Bills, and
 * Credit Notes - each row submits as `lines[{index}][description|quantity|
 * unitPrice]` inside the surrounding form's own FormData, parsed back out
 * by parseLineItems() in src/modules/accounting/service.ts. No client-side
 * validation beyond input types/required - the server recomputes and
 * validates every line total itself, this editor's running total is purely
 * a convenience preview. When tax rules are passed, each row can choose its
 * own rule (lines[{index}][taxRuleId]); blank means the document's rule.
 */
export function LineItemsEditor({ currency, initialLines, taxRules = [] }: LineItemsEditorProps) {
  const [lines, setLines] = useState<LineItemRow[]>(initialLines?.length ? initialLines : [EMPTY_ROW]);
  const idPrefix = useId();

  const updateLine = (index: number, field: keyof LineItemRow, value: string) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };
  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_ROW }]);
  const removeLine = (index: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);
  const withTax = taxRules.length > 0;
  const columns = withTax ? "grid-cols-[1fr_4.5rem_5.5rem_8rem_2rem]" : "grid-cols-[1fr_4.5rem_5.5rem_2rem]";

  return (
    <div className="space-y-2">
      <div className={`grid ${columns} gap-2 text-xs text-muted-foreground`}>
        <span>Description</span>
        <span>Qty</span>
        <span>Unit price</span>
        {withTax ? <span>Line tax rule</span> : null}
        <span />
      </div>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={`${idPrefix}-${index}`} className={`grid ${columns} items-center gap-2`}>
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
            {withTax ? (
              <select
                name={`lines[${index}][taxRuleId]`}
                value={line.taxRuleId ?? ""}
                onChange={(event) => updateLine(index, "taxRuleId", event.target.value)}
                aria-label={`Tax rule for line ${index + 1}`}
                className="h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Same as document</option>
                {taxRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}
              </select>
            ) : null}
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeLine(index)} disabled={lines.length === 1} aria-label={`Remove line ${index + 1}`}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      {withTax ? <p className="text-xs text-muted-foreground">A line tax rule applies only when the document uses a tax rule. Use it for mixed supplies, for example standard and reduced-rate items on one invoice.</p> : null}
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
