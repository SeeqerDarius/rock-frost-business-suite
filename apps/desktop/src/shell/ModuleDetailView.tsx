import { useCallback, useEffect, useState } from "react";
import { Clock3, Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
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
 * POS has since graduated to a full real UI (PosModuleShell) and is never
 * routed here; this demo view remains for Fleet/Installment/Inventory,
 * which are explicitly out of scope for full offline parity.
 */
type DemoModuleKey = Exclude<OfflineModuleKey, "pos">;
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
    <section aria-labelledby="module-detail-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <h2 id="module-detail-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
          {meta?.label ?? moduleKey}
        </h2>
        <Button onClick={() => void handleRecordDemoEntry()} loading={recording} variant="secondary">
          <Plus size={14} aria-hidden="true" />
          Record example entry
        </Button>
      </div>

      {records.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--rf-muted-foreground)" }}>
            No records cached for this module yet on this device. Sync to pull existing records, or use &quot;Record example
            entry&quot; to see how an offline entry appears before it syncs.
          </p>
        </Card>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {records.map((record) => (
            <li key={record.entityId}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.8125rem", fontFamily: "monospace", color: "var(--rf-muted-foreground)" }}>
                    {record.entityId.slice(0, 8)}
                  </p>
                  <p style={{ margin: "0.15rem 0 0", fontSize: "0.8125rem" }}>Updated {formatRelativeTime(record.updatedAt)}</p>
                </div>
                {record.hasPendingLocalChange ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.25rem 0.6rem",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "var(--rf-warning)",
                      background: "color-mix(in oklch, var(--rf-warning) 18%, transparent)",
                      flexShrink: 0,
                    }}
                  >
                    <Clock3 size={12} aria-hidden="true" />
                    Pending sync
                  </span>
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--rf-muted-foreground)", flexShrink: 0 }}>Synced</span>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
