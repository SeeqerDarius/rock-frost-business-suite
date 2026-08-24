"use client";

import { useMemo, useState } from "react";
import { Delete, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductPicker, type PickerItem, type PickerCategory } from "./product-picker";

type Line = { key: number; itemId: string | null; description: string; quantity: number; unitPrice: string };
type Payment = { key: number; method: string; amount: string; reference: string };
type KeypadMode = "qty" | "price";

const KEYPAD_KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "back"] as const;

function lineTotal(line: Line) {
  return Number(line.unitPrice || 0) * Number(line.quantity || 0);
}

/** Money must serialize as `\d+(\.\d{1,2})?` for the server's validator — a keypad session
 * still mid-edit (e.g. a trailing "12.") would otherwise fail that regex on submit. */
function sanitizeMoney(value: string): string {
  if (value === "" || value === ".") return "0.00";
  if (value.endsWith(".")) return `${value.slice(0, -1)}.00`;
  return value;
}

function appendPriceDigit(field: string, digit: string): string {
  if (field === "0") return digit;
  const decimalIndex = field.indexOf(".");
  if (decimalIndex !== -1 && field.length - decimalIndex - 1 >= 2) return field;
  return field + digit;
}

export function SaleCart({ items: initialItems, categories: initialCategories }: { items: PickerItem[]; categories: PickerCategory[] }) {
  const [items, setItems] = useState(initialItems);
  const [categories, setCategories] = useState(initialCategories);
  const [nextKey, setNextKey] = useState(2);
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [keypadMode, setKeypadMode] = useState<KeypadMode>("qty");
  const [keypadDirty, setKeypadDirty] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [payments, setPayments] = useState<Payment[]>([{ key: 1, method: "CASH", amount: "0.00", reference: "" }]);
  const [suspended, setSuspended] = useState(false);
  const total = useMemo(() => lines.reduce((sum, line) => sum + lineTotal(line), 0), [lines]);

  function selectLine(key: number) {
    setSelectedKey(key);
    setKeypadDirty(false);
  }

  function setMode(mode: KeypadMode) {
    setKeypadMode(mode);
    setKeypadDirty(false);
  }

  function addToCart(item: PickerItem) {
    setLines((current) => {
      const existing = current.find((line) => line.itemId === item.id);
      if (existing) {
        selectLine(existing.key);
        return current.map((line) => line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line);
      }
      const key = nextKey;
      setNextKey((value) => value + 1);
      selectLine(key);
      return [...current, { key, itemId: item.id, description: item.name, quantity: 1, unitPrice: item.price }];
    });
  }

  function addCustomLine() {
    const key = nextKey;
    setNextKey((value) => value + 1);
    setLines((current) => [...current, { key, itemId: null, description: "", quantity: 1, unitPrice: "0.00" }]);
    selectLine(key);
  }

  function removeLine(key: number) {
    setLines((current) => current.filter((line) => line.key !== key));
    if (selectedKey === key) setSelectedKey(null);
  }

  function scanBarcode() {
    const code = barcode.trim().toLowerCase();
    if (!code) return;
    const item = items.find((candidate) => candidate.barcode?.toLowerCase() === code);
    if (item) addToCart(item);
    setBarcode("");
  }

  function pressKey(key: string) {
    if (selectedKey == null) return;
    setLines((current) => current.map((line) => {
      if (line.key !== selectedKey) return line;
      if (keypadMode === "qty") {
        const field = String(line.quantity);
        if (key === ".") return line;
        const next = key === "back" ? (keypadDirty ? field.slice(0, -1) : "") : (keypadDirty ? (field === "0" ? key : field + key) : key);
        return { ...line, quantity: Math.max(1, Math.min(100000, parseInt(next || "0", 10) || 0)) };
      }
      const field = line.unitPrice;
      let next: string;
      if (key === "back") next = keypadDirty ? field.slice(0, -1) : "";
      else if (key === ".") next = keypadDirty ? (field.includes(".") ? field : `${field}.`) : "0.";
      else next = keypadDirty ? appendPriceDigit(field, key) : key;
      return { ...line, unitPrice: next === "" ? "0" : next };
    }));
    setKeypadDirty(true);
  }

  function onItemCreated(item: PickerItem, category?: PickerCategory) {
    setItems((current) => [...current, item]);
    if (category) setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
    addToCart(item);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1.3fr]">
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((line) => ({ itemId: line.itemId, description: line.description || "Item", quantity: line.quantity, unitPrice: sanitizeMoney(line.unitPrice) })))} />
      <input type="hidden" name="payments" value={JSON.stringify(payments.map((payment) => ({ method: payment.method, amount: payment.amount, reference: payment.reference })))} />
      <input type="hidden" name="mode" value={suspended ? "SUSPENDED" : "COMPLETED"} />

      <div className="space-y-3">
        <Input placeholder="Scan barcode, then press Enter" value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); scanBarcode(); } }} />

        <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border p-2">
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Tap a product to start this sale.</p>
          ) : lines.map((line) => (
            <div
              key={line.key}
              role="button"
              tabIndex={0}
              onClick={() => selectLine(line.key)}
              onKeyDown={(event) => { if (event.key === "Enter") selectLine(line.key); }}
              className={`flex items-center gap-2 rounded-lg border p-2 text-sm transition-colors ${selectedKey === line.key ? "border-primary bg-primary/5" : "border-transparent hover:bg-secondary/50"}`}
            >
              <div className="min-w-0 flex-1">
                {line.itemId ? (
                  <p className="truncate font-medium">{line.description}</p>
                ) : (
                  <Input
                    placeholder="Custom item description"
                    value={line.description}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setLines((current) => current.map((entry) => entry.key === line.key ? { ...entry, description: event.target.value } : entry))}
                    className="h-7"
                  />
                )}
                <p className="text-xs text-muted-foreground">{line.quantity} x {line.unitPrice}</p>
              </div>
              <p className="w-20 shrink-0 text-right font-medium">{lineTotal(line).toFixed(2)}</p>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={(event) => { event.stopPropagation(); removeLine(line.key); }}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={lines.length >= 100} onClick={addCustomLine}><Plus />Custom line</Button>

        <div className="rounded-lg border p-2">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <Button type="button" size="sm" variant={keypadMode === "qty" ? "default" : "outline"} onClick={() => setMode("qty")}>Qty</Button>
            <Button type="button" size="sm" variant={keypadMode === "price" ? "default" : "outline"} onClick={() => setMode("price")}>Price</Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {KEYPAD_KEYS.map((key) => (
              <Button key={key} type="button" variant="outline" disabled={selectedKey == null} className="h-10 text-base" onClick={() => pressKey(key)}>
                {key === "back" ? <Delete /> : key}
              </Button>
            ))}
          </div>
          {selectedKey == null ? <p className="mt-2 text-xs text-muted-foreground">Select a line to edit its quantity or price.</p> : null}
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-3 flex items-center justify-between"><p className="font-medium">Payments</p><p className="text-lg font-semibold">Total {total.toFixed(2)}</p></div>
          {!suspended ? payments.map((payment, index) => (
            <div key={payment.key} className="mb-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <select className="h-8 rounded-lg border bg-background px-2 text-sm" value={payment.method} onChange={(event) => setPayments((current) => current.map((entry) => entry.key === payment.key ? { ...entry, method: event.target.value } : entry))}>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="MOBILE_MONEY">Mobile money</option>
                <option value="OTHER">Other</option>
              </select>
              <Input aria-label={`Payment ${index + 1} amount`} type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => setPayments((current) => current.map((entry) => entry.key === payment.key ? { ...entry, amount: event.target.value } : entry))} />
              <Input aria-label={`Payment ${index + 1} reference`} placeholder="Reference (optional)" value={payment.reference} onChange={(event) => setPayments((current) => current.map((entry) => entry.key === payment.key ? { ...entry, reference: event.target.value } : entry))} />
              <Button type="button" variant="ghost" size="icon" disabled={payments.length === 1} onClick={() => setPayments((current) => current.filter((entry) => entry.key !== payment.key))}><Trash2 /></Button>
            </div>
          )) : <p className="text-sm text-muted-foreground">Payment and stock movement will be recorded when this sale is resumed.</p>}
          {!suspended ? (
            <Button type="button" size="sm" variant="outline" disabled={payments.length >= 10} onClick={() => { const key = nextKey; setPayments((current) => [...current, { key, method: "CASH", amount: "0.00", reference: "" }]); setNextKey((value) => value + 1); }}>
              <Plus />Split payment
            </Button>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={suspended} onChange={(event) => setSuspended(event.target.checked)} />Suspend this sale for later</label>
        <Button type="submit" size="lg" className="w-full" disabled={lines.length === 0}>{suspended ? "Suspend sale" : "Payment"}</Button>
      </div>

      <div>
        <Label className="mb-2 block">Products</Label>
        <ProductPicker items={items} categories={categories} onAddItem={addToCart} onItemCreated={onItemCreated} />
      </div>
    </div>
  );
}
