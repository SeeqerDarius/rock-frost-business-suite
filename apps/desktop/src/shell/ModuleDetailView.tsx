import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SyncBadge } from "@/components/form-fields";
import { useApp } from "@/state/AppProvider";
import { createFleetAdapter } from "@/modules/fleet/adapter";
import { createInstallmentAdapter } from "@/modules/installment/adapter";
import { createInventoryAdapter } from "@/modules/inventory/adapter";
import { MODULES } from "@/shell/ModuleLauncher";
import type { OfflineModuleKey } from "@/contract/sync-contract";
import type { CachedRecord } from "@/db/schema";

/**
 * One representative "record a new offline entry" action per module,
 * wired to the real adapter functions in src/modules/<key>/adapter.ts -
 * this is the example implementation the assignment brief asks for, not a
 * full CRUD UI for every entity type. Each module has several entity
 * types (see the adapter files); this view demonstrates one to keep the
 * shell's scope proportional to "foundation," not a finished business app.
 * POS and School have since graduated to full real UIs (PosModuleShell,
 * SchoolModuleShell) and are never routed here; this demo view remains for
 * Fleet/Installment/Inventory, which are explicitly out of scope for full
 * offline parity.
 */
type DemoModuleKey = Exclude<OfflineModuleKey, "pos" | "school">;
const DEMO_ENTITY_TYPE: Record<DemoModuleKey, string> = {
  fleet: "fleet.maintenance_request",
  installment: "installment.payment",
  inventory: "inventory.movement",
};

function formatRelativeTime(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return diffHours < 24 ? `${diffHours}h ago` : new Date(iso).toLocaleDateString();
}

export function ModuleDetailView({ moduleKey }: { moduleKey: DemoModuleKey }) {
  const { db, device, recordActivity } = useApp();
  const [records, setRecords] = useState<CachedRecord[]>([]);
  const [recording, setRecording] = useState(false);
  const meta = MODULES.find((m) => m.key === moduleKey);
  const entityType = DEMO_ENTITY_TYPE[moduleKey];

  const reload = useCallback(async () => {
    const list = await db.listCachedRecords(moduleKey, entityType);
    setRecords(list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
  }, [db, moduleKey, entityType]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleRecordDemoEntry() {
    if (!device) return;
    recordActivity();
    setRecording(true);
    try {
      const entityId = crypto.randomUUID();
      const ctx = { db, organizationId: device.organizationId, actingUserName: device.userName };
      const nowIso = new Date().toISOString();

      if (moduleKey === "fleet") {
        await createFleetAdapter(ctx).recordMaintenanceRequest(entityId, {
          vehicleId: "demo-vehicle",
          faultDescription: "Example maintenance request",
          ownerApprovalRequired: false,
        });
      } else if (moduleKey === "installment") {
        await createInstallmentAdapter(ctx).recordPayment(entityId, {
          accountId: "demo-account",
          amount: "25.00",
          paymentDate: nowIso,
          method: "CASH",
          notes: null,
        });
      } else {
        await createInventoryAdapter(ctx).recordMovement(entityId, {
          warehouseId: "demo-warehouse",
          itemId: "demo-item",
          type: "ADJUSTMENT",
          quantity: 1,
          reference: null,
          notes: null,
          occurredAt: nowIso,
        });
      }
      await reload();
    } finally {
      setRecording(false);
    }
  }

  return (
    <section aria-labelledby="module-detail-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="module-detail-heading" className="m-0 text-[1.05rem] font-bold">
          {meta?.label ?? moduleKey}
        </h2>
        <Button onClick={() => void handleRecordDemoEntry()} loading={recording} variant="secondary">
          <Plus size={14} aria-hidden="true" />
          Record example entry
        </Button>
      </div>

      {records.length === 0 ? (
        <Card>
          <p className="m-0 text-sm text-muted-foreground">
            No records cached for this module yet on this device. Sync to pull existing records, or use &quot;Record example
            entry&quot; to see how an offline entry appears before it syncs.
          </p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {records.map((record) => (
            <li key={record.entityId}>
              <Card className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 font-mono text-[0.8125rem] text-muted-foreground">
                    {record.entityId.slice(0, 8)}
                  </p>
                  <p className="mt-0.5 mb-0 text-[0.8125rem]">Updated {formatRelativeTime(record.updatedAt)}</p>
                </div>
                <SyncBadge pending={record.hasPendingLocalChange} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
