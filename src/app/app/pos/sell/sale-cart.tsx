"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Item = { id: string; name: string; sku: string; barcode: string | null; price: string };
type Line = { key: number; itemId: string; description: string; quantity: number; unitPrice: string };
type Payment = { key: number; method: string; amount: string; reference: string };

export function SaleCart({ items }: { items: Item[] }) {
  const [nextKey, setNextKey] = useState(2);
  const [lines, setLines] = useState<Line[]>([{ key: 1, itemId: "", description: "", quantity: 1, unitPrice: "0.00" }]);
  const [payments, setPayments] = useState<Payment[]>([{ key: 1, method: "CASH", amount: "0.00", reference: "" }]);
  const [suspended, setSuspended] = useState(false);
  const total = useMemo(() => lines.reduce((sum, line) => sum + Number(line.unitPrice || 0) * Number(line.quantity || 0), 0), [lines]);

  function chooseItem(lineKey: number, itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId);
    setLines((current) => current.map((line) => line.key === lineKey ? { ...line, itemId, description: item?.name ?? line.description, unitPrice: item?.price ?? line.unitPrice } : line));
  }

  function scanBarcode(lineKey: number, barcode: string) {
    const item = items.find((candidate) => candidate.barcode?.toLowerCase() === barcode.trim().toLowerCase());
    if (item) chooseItem(lineKey, item.id);
  }

  return (
    <div className="space-y-5">
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((line) => ({ itemId: line.itemId, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })))} />
      <input type="hidden" name="payments" value={JSON.stringify(payments.map((payment) => ({ method: payment.method, amount: payment.amount, reference: payment.reference })))} />
      <input type="hidden" name="mode" value={suspended ? "SUSPENDED" : "COMPLETED"} />
      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1.2fr_1.2fr_2fr_0.6fr_0.8fr_auto]">
            <div className="space-y-1"><Label>Barcode</Label><Input placeholder="Scan or type" onBlur={(event) => scanBarcode(line.key, event.target.value)} /></div>
            <div className="space-y-1"><Label>Inventory item</Label><select className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={line.itemId} onChange={(event) => chooseItem(line.key, event.target.value)}><option value="">Custom line</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}</select></div>
            <div className="space-y-1"><Label>Description</Label><Input value={line.description} onChange={(event) => setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, description: event.target.value } : entry))} /></div>
            <div className="space-y-1"><Label>Qty</Label><Input type="number" min={1} value={line.quantity} onChange={(event) => setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, quantity: Number(event.target.value) } : entry))} /></div>
            <div className="space-y-1"><Label>Unit price</Label><Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, unitPrice: event.target.value } : entry))} /></div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" disabled={lines.length >= 100} onClick={() => { setLines((current) => [...current, { key: nextKey, itemId: "", description: "", quantity: 1, unitPrice: "0.00" }]); setNextKey((key) => key + 1); }}><Plus />Add line</Button>
      </div>
      <div className="rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between"><p className="font-medium">Payments</p><p className="text-lg font-semibold">Total {total.toFixed(2)}</p></div>
        {!suspended ? payments.map((payment, index) => (
          <div key={payment.key} className="mb-2 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <select className="h-8 rounded-lg border bg-background px-2 text-sm" value={payment.method} onChange={(event) => setPayments((current) => current.map((entry) => entry.key === payment.key ? { ...entry, method: event.target.value } : entry))}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="MOBILE_MONEY">Mobile money</option><option value="OTHER">Other</option></select>
            <Input aria-label={`Payment ${index + 1} amount`} type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => setPayments((current) => current.map((entry) => entry.key === payment.key ? { ...entry, amount: event.target.value } : entry))} />
            <Input aria-label={`Payment ${index + 1} reference`} placeholder="Reference (optional)" value={payment.reference} onChange={(event) => setPayments((current) => current.map((entry) => entry.key === payment.key ? { ...entry, reference: event.target.value } : entry))} />
            <Button type="button" variant="ghost" size="icon" disabled={payments.length === 1} onClick={() => setPayments((current) => current.filter((entry) => entry.key !== payment.key))}><Trash2 /></Button>
          </div>
        )) : <p className="text-sm text-muted-foreground">Payment and stock movement will be recorded when this sale is resumed.</p>}
        {!suspended ? <Button type="button" size="sm" variant="outline" disabled={payments.length >= 10} onClick={() => { const key = nextKey; setPayments((current) => [...current, { key, method: "CASH", amount: "0.00", reference: "" }]); setNextKey((value) => value + 1); }}><Plus />Split payment</Button> : null}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={suspended} onChange={(event) => setSuspended(event.target.checked)} />Suspend this sale for later</label>
      <Button type="submit" className="w-full">{suspended ? "Suspend sale" : "Complete sale"}</Button>
    </div>
  );
}
