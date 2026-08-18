import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/state/AppProvider";
import { createPosAdapter } from "@/modules/pos/adapter";
import type { PosSnapshot } from "@/modules/pos/pos-data";
import type { PosSaleRefundPayload } from "@/modules/pos/types";
import { formatMoney, formatRelativeTime, SyncBadge } from "@/components/form-fields";

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
    <section aria-labelledby="pos-sales-heading" className="flex flex-col gap-4">
      <h2 id="pos-sales-heading" className="m-0 text-[1.05rem] font-bold">
        Sales history
      </h2>

      {snapshot.sales.length === 0 ? (
        <Card>
          <p className="m-0 text-sm text-muted-foreground">
            No sales cached on this device yet. Ring up a sale from the Sell tab, or sync to pull recent sales.
          </p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {snapshot.sales.map((sale) => {
            const alreadyQueued = pendingRefundSaleIds.has(sale.entityId);
            const canRefund = sale.data.status === "COMPLETED" && !alreadyQueued;
            return (
              <li key={sale.entityId}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="m-0 text-[0.9375rem] font-semibold">
                      {sale.data.saleNumber} {sale.data.customerName ? `· ${sale.data.customerName}` : ""}
                    </p>
                    <p className="mt-0.5 mb-0 text-[0.8125rem] text-muted-foreground">
                      {sale.data.lines.length} item(s) &middot; {sale.data.paymentMethod} &middot; {formatRelativeTime(sale.data.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[0.9375rem] font-bold">GHS {formatMoney(sale.data.total)}</span>
                    <SaleStatusBadge status={sale.data.status} pendingRefund={alreadyQueued} />
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

function SaleStatusBadge({ status, pendingRefund }: { status: "COMPLETED" | "REFUNDED"; pendingRefund: boolean }) {
  if (status === "REFUNDED") return <Badge variant="destructive">Refunded</Badge>;
  if (pendingRefund) return <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">Refund queued</Badge>;
  return <Badge>Completed</Badge>;
}
