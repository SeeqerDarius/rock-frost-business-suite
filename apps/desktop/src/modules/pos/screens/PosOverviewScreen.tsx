import { Card } from "@/components/Card";
import type { PosSnapshot } from "@/modules/pos/pos-data";
import { computePosSummary } from "@/modules/pos/pos-summary";
import { formatMoney } from "@/modules/pos/screens/shared";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--rf-muted-foreground)", fontWeight: 600 }}>{label}</p>
      <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800 }}>{value}</p>
      {hint ? <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>{hint}</p> : null}
    </Card>
  );
}

export function PosOverviewScreen({ snapshot }: { snapshot: PosSnapshot }) {
  const summary = computePosSummary(snapshot.sales, snapshot.registers, snapshot.sessions);
  const pendingCount =
    snapshot.registers.filter((r) => r.hasPendingLocalChange).length +
    snapshot.sales.filter((s) => s.hasPendingLocalChange).length;

  return (
    <section aria-labelledby="pos-overview-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 id="pos-overview-heading" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
        Overview
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: "0.75rem" }}>
        <Tile label="Registers" value={String(summary.registerCount)} />
        <Tile label="Open sessions" value={String(summary.openSessionCount)} />
        <Tile label="Today's sales" value={String(summary.todaySalesCount)} hint={`GHS ${formatMoney(String(summary.todaySalesTotal))}`} />
        <Tile label="All-time sales" value={String(summary.allTimeSalesCount)} hint={`GHS ${formatMoney(String(summary.allTimeSalesTotal))}`} />
      </div>
      {pendingCount > 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: "0.8125rem" }}>
            {pendingCount} {pendingCount === 1 ? "change is" : "changes are"} waiting to sync. They already count above and are
            visible everywhere on this device, but the cloud copy will not reflect them until the next successful sync.
          </p>
        </Card>
      ) : null}
      {snapshot.registers.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--rf-muted-foreground)" }}>
            No registers on this device yet. Sync once online, or add one from the Registers tab.
          </p>
        </Card>
      ) : null}
    </section>
  );
}
