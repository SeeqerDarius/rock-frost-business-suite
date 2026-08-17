import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useApp } from "@/state/AppProvider";
import { createPosAdapter } from "@/modules/pos/adapter";
import type { PosSnapshot } from "@/modules/pos/pos-data";
import type { PosSaleRefundPayload } from "@/modules/pos/types";
import { formatMoney, formatRelativeTime, SyncBadge } from "@/modules/pos/screens/shared";

export function PosSalesHistoryScreen({ snapshot, onChanged }: { snapshot: PosSnapshot; onChanged: () => Promise<void> }) {
  const { db, device, recordActivity } = useApp();
  const [pendingRefundSaleIds, setPendingRefundSaleIds] = useState<Set<string>>(new Set());
  const [refundingId, setRefundingId] = useState<string | null>(null);

  useEffect(() => {
    void db.listCachedRecords("pos", "pos.sale_refund").then((rows) => {
      setPendingRefundSaleIds(new Set(rows.map((r) => (r.payload as PosSaleRefundPayload).saleId)));
    });
  }, [db, snapshot]);

  async function handleRefund(saleId: string) {
    if (!device) return;
    recordActivity();
    setRefundingId(saleId);
    try {
      const adapter = createPosAdapter({ db, organizationId: device.organizationId, actingUserName: device.userName });
      await adapter.refundSale(crypto.randomUUID(), { saleId });
      await onChanged();
    } finally {
      setRefundingId(null);
    }
  }

  return (
    <section aria-labelledby="pos-sales-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 id="pos-sales-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Sales history
      </h2>

      {snapshot.sales.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--rf-muted-foreground)" }}>
            No sales cached on this device yet. Ring up a sale from the Sell tab, or sync to pull recent sales.
          </p>
        </Card>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {snapshot.sales.map((sale) => {
            const alreadyQueued = pendingRefundSaleIds.has(sale.entityId);
            const canRefund = sale.data.status === "COMPLETED" && !alreadyQueued;
            return (
              <li key={sale.entityId}>
                <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>
                      {sale.data.saleNumber} {sale.data.customerName ? `· ${sale.data.customerName}` : ""}
                    </p>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>
                      {sale.data.lines.length} item(s) &middot; {sale.data.paymentMethod} &middot; {formatRelativeTime(sale.data.createdAt)}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9375rem" }}>GHS {formatMoney(sale.data.total)}</span>
                    <StatusPill status={sale.data.status} pendingRefund={alreadyQueued} />
                    <SyncBadge pending={sale.hasPendingLocalChange} />
                    {canRefund ? (
                      <Button variant="destructive" onClick={() => void handleRefund(sale.entityId)} loading={refundingId === sale.entityId}>
                        <Undo2 size={14} aria-hidden="true" />
                        Refund
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StatusPill({ status, pendingRefund }: { status: "COMPLETED" | "REFUNDED"; pendingRefund: boolean }) {
  if (status === "REFUNDED") {
    return <span style={pillStyle("var(--rf-destructive)")}>Refunded</span>;
  }
  if (pendingRefund) {
    return <span style={pillStyle("var(--rf-warning)")}>Refund queued</span>;
  }
  return <span style={pillStyle("var(--rf-primary)")}>Completed</span>;
}

function pillStyle(color: string): React.CSSProperties {
  return {
    padding: "0.2rem 0.55rem",
    borderRadius: "999px",
    fontSize: "0.75rem",
    fontWeight: 700,
    color,
    background: `color-mix(in oklch, ${color} 16%, transparent)`,
  };
}
