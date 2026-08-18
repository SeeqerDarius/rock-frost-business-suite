import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/state/AppProvider";
import { createPosAdapter } from "@/modules/pos/adapter";
import type { PosSnapshot } from "@/modules/pos/pos-data";
import { LocalStockOverlay } from "@/modules/pos/local-stock-overlay";
import type { PosSaleLine, PosSessionClosePayload } from "@/modules/pos/types";
import { Field, ErrorText, formatMoney } from "@/components/form-fields";

interface InventoryItemRecord { sku: string; name: string; unit: string; costPrice?: string }
interface InventoryStockRecord { itemId: string; warehouseId: string; quantity: number }

const PAYMENT_METHODS: { value: "CASH" | "CARD" | "MOBILE_MONEY" | "OTHER"; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "OTHER", label: "Other" },
];

/** shadcn's Select does not accept an empty-string item value, so a "custom line"/"no selection" placeholder uses this sentinel and is translated to/from "" at the state boundary. */
const CUSTOM_LINE = "__custom__";
const NONE = "__none__";

export function PosSellScreen({ snapshot, onChanged }: { snapshot: PosSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const [items, setItems] = useState<{ entityId: string; data: InventoryItemRecord }[]>([]);
  const [stock, setStock] = useState<{ entityId: string; data: InventoryStockRecord }[]>([]);
  const [pendingCloseSessionIds, setPendingCloseSessionIds] = useState<Set<string>>(new Set());
  const overlayRef = useRef(new LocalStockOverlay());

  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [lines, setLines] = useState<PosSaleLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "MOBILE_MONEY" | "OTHER">("CASH");
  const [customerName, setCustomerName] = useState("");
  const [saleError, setSaleError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastSaleAt, setLastSaleAt] = useState<number | null>(null);

  const [lineItemId, setLineItemId] = useState("");
  const [lineDescription, setLineDescription] = useState("");
  const [lineQuantity, setLineQuantity] = useState("1");
  const [lineUnitPrice, setLineUnitPrice] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);

  const openSessions = useMemo(() => snapshot.sessions.filter((s) => s.data.status === "OPEN"), [snapshot.sessions]);
  const selectedSession = openSessions.find((s) => s.entityId === selectedSessionId) ?? null;
  const selectedWarehouseId = selectedSession?.data.register.warehouseId ?? null;

  useEffect(() => {
    void (async () => {
      const [itemRows, stockRows, closeRows] = await Promise.all([
        db.listCachedRecords("inventory", "inventory.item"),
        db.listCachedRecords("inventory", "inventory.stock"),
        db.listCachedRecords("pos", "pos.session_close"),
      ]);
      setItems(itemRows.map((r) => ({ entityId: r.entityId, data: r.payload as InventoryItemRecord })));
      setStock(stockRows.map((r) => ({ entityId: r.entityId, data: r.payload as InventoryStockRecord })));
      setPendingCloseSessionIds(new Set(closeRows.map((r) => (r.payload as PosSessionClosePayload).sessionId)));
      overlayRef.current.reset();
    })();
  }, [db, snapshot]);

  useEffect(() => {
    const firstOpenSessionId = openSessions[0]?.entityId;
    if (!selectedSessionId && firstOpenSessionId) setSelectedSessionId(firstOpenSessionId);
  }, [openSessions, selectedSessionId]);

  function stockFor(itemId: string): number | null {
    if (!selectedWarehouseId) return null;
    const row = stock.find((s) => s.data.itemId === itemId && s.data.warehouseId === selectedWarehouseId);
    if (!row) return null;
    return overlayRef.current.projectedQuantity(itemId, row.data.quantity);
  }

  function handleAddLine() {
    setLineError(null);
    const quantity = Number(lineQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setLineError("Quantity must be a whole number greater than 0.");
      return;
    }
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(lineUnitPrice.trim())) {
      setLineError("Enter a unit price such as 10.00.");
      return;
    }
    const pickedItem = items.find((item) => item.entityId === lineItemId);
    const description = lineDescription.trim() || pickedItem?.data.name;
    if (!description) {
      setLineError("Pick an item or enter a description.");
      return;
    }
    setLines((current) => [...current, { itemId: lineItemId || null, description, quantity, unitPrice: lineUnitPrice.trim() }]);
    setLineItemId("");
    setLineDescription("");
    setLineQuantity("1");
    setLineUnitPrice("");
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  const total = lines.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0);

  async function handleCompleteSale() {
    if (!device || !selectedSessionId) return;
    if (lines.length === 0) {
      setSaleError("Add at least one line item.");
      return;
    }
    setSaleError(null);
    setSubmitting(true);
    recordActivity();
    try {
      const adapter = createPosAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName });
      await adapter.recordSale(crypto.randomUUID(), {
        sessionId: selectedSessionId,
        customerName: customerName.trim() || null,
        paymentMethod,
        lines,
      });
      overlayRef.current.recordSaleLines(lines);
      setLines([]);
      setCustomerName("");
      setLastSaleAt(Date.now());
      await onChanged();
    } catch {
      setSaleError("Could not queue this sale. It has not been recorded; try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="pos-sell-heading" className="flex flex-col gap-4">
      <h2 id="pos-sell-heading" className="m-0 text-[1.05rem] font-bold">
        Sell
      </h2>

      <SessionPicker
        snapshot={snapshot}
        openSessions={openSessions}
        selectedSessionId={selectedSessionId}
        onSelect={setSelectedSessionId}
        pendingCloseSessionIds={pendingCloseSessionIds}
        onChanged={onChanged}
      />

      {selectedSessionId ? (
        <>
          <Card className="flex flex-col gap-3">
            <p className="m-0 text-sm font-semibold">Add item</p>
            <div className="grid items-end gap-2 [grid-template-columns:minmax(0,1.4fr)_minmax(0,1.6fr)_5rem_6rem_auto]">
              <Field label="Catalog item" id="pos-sell-item">
                <Select
                  value={lineItemId || CUSTOM_LINE}
                  onValueChange={(value) => {
                    setLineItemId(!value || value === CUSTOM_LINE ? "" : value);
                    setLineDescription("");
                  }}
                >
                  <SelectTrigger id="pos-sell-item" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CUSTOM_LINE}>Custom line</SelectItem>
                    {items.map((item) => {
                      const qty = stockFor(item.entityId);
                      return (
                        <SelectItem key={item.entityId} value={item.entityId}>
                          {item.data.name} {qty !== null ? `(${qty} ${item.data.unit} in stock)` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Description" id="pos-sell-description" hint={lineItemId ? "Optional override" : undefined}>
                <Input id="pos-sell-description" value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} placeholder={items.find((i) => i.entityId === lineItemId)?.data.name} />
              </Field>
              <Field label="Qty" id="pos-sell-qty">
                <Input id="pos-sell-qty" inputMode="numeric" value={lineQuantity} onChange={(e) => setLineQuantity(e.target.value)} />
              </Field>
              <Field label="Unit price" id="pos-sell-price">
                <Input id="pos-sell-price" inputMode="decimal" value={lineUnitPrice} onChange={(e) => setLineUnitPrice(e.target.value)} placeholder="0.00" />
              </Field>
              <Button type="button" variant="secondary" onClick={handleAddLine}>
                <Plus size={14} aria-hidden="true" />
                Add
              </Button>
            </div>
            {lineError ? <ErrorText>{lineError}</ErrorText> : null}
          </Card>

          <Card className="flex flex-col gap-2.5">
            <p className="m-0 text-sm font-semibold">Cart</p>
            {lines.length === 0 ? (
              <p className="m-0 text-[0.8125rem] text-muted-foreground">No items added yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {lines.map((line, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      {line.quantity} x {line.description}
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span>GHS {formatMoney(String(Number(line.unitPrice) * line.quantity))}</span>
                      <Button type="button" variant="ghost" onClick={() => removeLine(index)} aria-label="Remove line">
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between border-t pt-1.5 text-[0.9375rem] font-bold">
              <span>Total</span>
              <span>GHS {formatMoney(String(total))}</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Customer name" id="pos-sell-customer" hint="Optional">
                <Input id="pos-sell-customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </Field>
              <Field label="Payment method" id="pos-sell-payment">
                <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}>
                  <SelectTrigger id="pos-sell-payment" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {saleError ? <ErrorText>{saleError}</ErrorText> : null}
            {lastSaleAt ? (
              <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] text-primary">
                <CheckCircle2 size={14} aria-hidden="true" />
                Sale queued. It is in the pending sync count and does not need to be re-entered.
              </p>
            ) : null}
            <Button onClick={() => void handleCompleteSale()} loading={submitting} disabled={lines.length === 0}>
              Complete sale
            </Button>
          </Card>
        </>
      ) : null}
    </section>
  );
}

function SessionPicker({
  snapshot,
  openSessions,
  selectedSessionId,
  onSelect,
  pendingCloseSessionIds,
  onChanged,
}: {
  snapshot: PosSnapshot;
  openSessions: PosSnapshot["sessions"];
  selectedSessionId: string;
  onSelect: (id: string) => void;
  pendingCloseSessionIds: Set<string>;
  onChanged: () => Promise<void>;
}) {
  const { db, device, recordActivity } = useApp();
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [registerId, setRegisterId] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [closingCash, setClosingCash] = useState("");
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justOpenedOffline, setJustOpenedOffline] = useState(false);

  // Excludes registers still pending their own offline create: opening a
  // session against one before it has synced would reference a registerId
  // the server has never heard of, since pos.register CREATE uses the
  // client's own locally-generated id as a placeholder, not the server's
  // eventual real one (see docs/OFFLINE_DESKTOP.md's Push section).
  const eligibleRegisters = snapshot.registers.filter((r) => r.data.active !== false && !r.hasPendingLocalChange && !openSessions.some((s) => s.data.registerId === r.entityId));

  async function handleOpenSession() {
    if (!device || !registerId) return;
    setError(null);
    setBusy(true);
    recordActivity();
    try {
      const adapter = createPosAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName });
      await adapter.openSession(crypto.randomUUID(), { registerId, openingFloat: openingFloat.trim() || "0.00" });
      setShowOpenForm(false);
      setJustOpenedOffline(true);
      await onChanged();
    } catch {
      setError("Could not queue this session open. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseSession() {
    if (!device || !selectedSessionId) return;
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(closingCash.trim())) {
      setError("Enter the counted closing cash, such as 120.00.");
      return;
    }
    setError(null);
    setBusy(true);
    recordActivity();
    try {
      const adapter = createPosAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName });
      await adapter.closeSession(crypto.randomUUID(), { sessionId: selectedSessionId, closingCash: closingCash.trim() });
      setShowCloseForm(false);
      setClosingCash("");
      await onChanged();
    } catch {
      setError("Could not queue this session close. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedIsClosing = pendingCloseSessionIds.has(selectedSessionId);

  return (
    <Card className="flex flex-col gap-2.5">
      <p className="m-0 text-sm font-semibold">Register session</p>
      {openSessions.length === 0 ? (
        <p className="m-0 text-[0.8125rem] text-muted-foreground">
          No open session is cached on this device. Open one while online so its session id syncs, then you can sell against it
          for the rest of the day even without a connection.
        </p>
      ) : (
        <Field label="Selling against" id="pos-sell-session">
          <Select value={selectedSessionId} onValueChange={(value) => onSelect(value ?? "")}>
            <SelectTrigger id="pos-sell-session" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {openSessions.map((session) => (
                <SelectItem key={session.entityId} value={session.entityId}>
                  {session.data.register.name} &middot; opened {new Date(session.data.openedAt).toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {selectedIsClosing ? (
        <p className="m-0 text-[0.8125rem] text-amber-700 dark:text-amber-400">
          A close for this session is already queued. It will stop appearing here once the close syncs.
        </p>
      ) : null}
      {justOpenedOffline ? (
        <p className="m-0 text-[0.8125rem] text-amber-700 dark:text-amber-400">
          Session open queued. It needs to sync before sales can be recorded against it.
        </p>
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}

      <div className="flex flex-wrap gap-2.5">
        {!showOpenForm ? (
          <Button type="button" variant="secondary" onClick={() => setShowOpenForm(true)} disabled={eligibleRegisters.length === 0}>
            <Plus size={14} aria-hidden="true" />
            Open a session
          </Button>
        ) : null}
        {selectedSessionId && !selectedIsClosing && !showCloseForm ? (
          <Button type="button" variant="ghost" onClick={() => setShowCloseForm(true)}>
            Close this session
          </Button>
        ) : null}
      </div>

      {showOpenForm ? (
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="Register" id="pos-open-register">
            <Select value={registerId || NONE} onValueChange={(value) => setRegisterId(!value || value === NONE ? "" : value)}>
              <SelectTrigger id="pos-open-register" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select a register</SelectItem>
                {eligibleRegisters.map((r) => (
                  <SelectItem key={r.entityId} value={r.entityId}>
                    {r.data.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Opening float" id="pos-open-float">
            <Input id="pos-open-float" inputMode="decimal" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
          </Field>
          <Button type="button" onClick={() => void handleOpenSession()} loading={busy} disabled={!registerId}>
            Open
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowOpenForm(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {showCloseForm ? (
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="Closing cash counted" id="pos-close-cash">
            <Input id="pos-close-cash" inputMode="decimal" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="0.00" />
          </Field>
          <Button type="button" onClick={() => void handleCloseSession()} loading={busy}>
            Confirm close
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowCloseForm(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
