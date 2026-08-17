import { useId, useState, type FormEvent } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createPosAdapter } from "@/modules/pos/adapter";
import type { PosSnapshot, PosRegisterRow } from "@/modules/pos/pos-data";
import { Field, inputStyle, ErrorText, SyncBadge } from "@/modules/pos/screens/shared";

export function PosRegistersScreen({ snapshot, onChanged }: { snapshot: PosSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const [editing, setEditing] = useState<PosRegisterRow | "new" | null>(null);

  if (!device) return null;

  return (
    <section aria-labelledby="pos-registers-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <h2 id="pos-registers-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
          Registers
        </h2>
        <Button variant="secondary" onClick={() => { recordActivity(); setEditing("new"); }}>
          <Plus size={14} aria-hidden="true" />
          New register
        </Button>
      </div>

      {editing ? (
        <RegisterForm
          key={editing === "new" ? "new" : editing.entityId}
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSubmit={async (name, warehouseId) => {
            recordActivity();
            const adapter = createPosAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName });
            if (editing === "new") {
              await adapter.createRegister(crypto.randomUUID(), { name, warehouseId });
            } else {
              await adapter.updateRegister(editing.entityId, { name, warehouseId }, editing.version);
            }
            setEditing(null);
            await onChanged();
          }}
        />
      ) : null}

      {snapshot.registers.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--rf-muted-foreground)" }}>
            No registers cached on this device yet. Create one, or sync once online to pull existing registers.
          </p>
        </Card>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {snapshot.registers.map((register) => (
            <li key={register.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>{register.data.name}</p>
                  <p style={{ margin: "0.15rem 0 0", fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>
                    {register.data.active ? "Active" : "Inactive"}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                  <SyncBadge pending={register.hasPendingLocalChange} />
                  <Button variant="ghost" onClick={() => { recordActivity(); setEditing(register); }} aria-label={`Edit ${register.data.name}`}>
                    <Pencil size={14} aria-hidden="true" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RegisterForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: PosRegisterRow | null;
  onCancel: () => void;
  onSubmit: (name: string, warehouseId: string | null) => Promise<void>;
}) {
  const nameId = useId();
  const warehouseId = useId();
  const [name, setName] = useState(initial?.data.name ?? "");
  const [warehouse, setWarehouse] = useState(initial?.data.warehouseId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Enter a register name.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(name.trim(), warehouse.trim() || null);
    } catch {
      setError("Could not save this register. It stays queued and will retry on the next sync.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Field label="Register name" id={nameId}>
          <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Warehouse ID" id={warehouseId} hint="Optional. Leave blank if this register is not tied to a specific warehouse.">
          <input id={warehouseId} value={warehouse} onChange={(e) => setWarehouse(e.target.value)} style={inputStyle} />
        </Field>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <Button type="submit" loading={saving}>
            {initial ? "Save changes" : "Create register"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
