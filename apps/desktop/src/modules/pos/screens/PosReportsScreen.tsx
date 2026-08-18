import { Card } from "@/components/Card";
import type { PosSnapshot } from "@/modules/pos/pos-data";
import { computePosSummary } from "@/modules/pos/pos-summary";
import { formatMoney } from "@/components/form-fields";

/**
 * Read-only, derived entirely from what this device has cached: there is no
 * separate offline reporting endpoint. On a device that has not synced
 * recently, these figures reflect only what happened on this device plus
 * whatever was last pulled, not every sale across the organization.
 */
export function PosReportsScreen({ snapshot }: { snapshot: PosSnapshot }) {
  const summary = computePosSummary(snapshot.sales, snapshot.registers, snapshot.sessions);
  const methods = Object.entries(summary.byPaymentMethod).sort((a, b) => b[1].total - a[1].total);

  return (
    <section aria-labelledby="pos-reports-heading" className="flex flex-col gap-4">
      <h2 id="pos-reports-heading" className="m-0 text-[1.05rem] font-bold">
        Reports
      </h2>

      <Card className="flex flex-col gap-2">
        <p className="m-0 text-sm font-semibold">Today</p>
        <div className="flex justify-between text-sm">
          <span>Sales</span>
          <span>{summary.todaySalesCount}</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span>Total</span>
          <span>GHS {formatMoney(String(summary.todaySalesTotal))}</span>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="m-0 text-sm font-semibold">All time (cached on this device)</p>
        <div className="flex justify-between text-sm">
          <span>Completed sales</span>
          <span>{summary.allTimeSalesCount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Refunded sales</span>
          <span>{summary.refundedCount}</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span>Total</span>
          <span>GHS {formatMoney(String(summary.allTimeSalesTotal))}</span>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="m-0 text-sm font-semibold">By payment method</p>
        {methods.length === 0 ? (
          <p className="m-0 text-[0.8125rem] text-muted-foreground">No completed sales cached yet.</p>
        ) : (
          methods.map(([method, bucket]) => (
            <div key={method} className="flex justify-between text-sm">
              <span>{method}</span>
              <span>
                {bucket.count} &middot; GHS {formatMoney(String(bucket.total))}
              </span>
            </div>
          ))
        )}
      </Card>
    </section>
  );
}
