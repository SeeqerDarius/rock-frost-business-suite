import { useId, useState, type FormEvent } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/state/AppProvider";
import { createPosAdapter } from "@/modules/pos/adapter";
import type { PosSnapshot, PosRegisterRow } from "@/modules/pos/pos-data";
import { Field, ErrorText, SyncBadge } from "@/components/form-fields";

export function PosRegistersScreen({ snapshot, onChanged }: { snapshot: PosSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const [editing, setEditing] = useState<PosRegisterRow | "new" | null>(null);

  if (!device) return null;

  return (
    <section aria-labelledby="pos-registers-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="pos-registers-heading" className="m-0 text-[1.05rem] font-bold">
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
          <p className="m-0 text-sm text-muted-foreground">
            No registers cached on this device yet. Create one, or sync once online to pull existing registers.
          </p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {snapshot.registers.map((register) => (
            <li key={register.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-[0.9375rem] font-semibold">{register.data.name}</p>
                  <p className="mt-0.5 mb-0 text-[0.8125rem] text-muted-foreground">
                    {register.data.active ? "Active" : "Inactive"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
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
      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-3">
        <Field label="Register name" id={nameId}>
          <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Warehouse ID" id={warehouseId} hint="Optional. Leave blank if this register is not tied to a specific warehouse.">
          <Input id={warehouseId} value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
        </Field>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <div className="flex gap-2.5">
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
