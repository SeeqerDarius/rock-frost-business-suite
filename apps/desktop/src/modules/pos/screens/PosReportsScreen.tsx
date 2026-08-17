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
    <section aria-labelledby="pos-reports-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 id="pos-reports-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Reports
      </h2>

      <Card style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>Today</p>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
          <span>Sales</span>
          <span>{summary.todaySalesCount}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", fontWeight: 700 }}>
          <span>Total</span>
          <span>GHS {formatMoney(String(summary.todaySalesTotal))}</span>
        </div>
      </Card>

      <Card style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>All time (cached on this device)</p>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
          <span>Completed sales</span>
          <span>{summary.allTimeSalesCount}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
          <span>Refunded sales</span>
          <span>{summary.refundedCount}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", fontWeight: 700 }}>
          <span>Total</span>
          <span>GHS {formatMoney(String(summary.allTimeSalesTotal))}</span>
        </div>
      </Card>

      <Card style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>By payment method</p>
        {methods.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>No completed sales cached yet.</p>
        ) : (
          methods.map(([method, bucket]) => (
            <div key={method} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
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
