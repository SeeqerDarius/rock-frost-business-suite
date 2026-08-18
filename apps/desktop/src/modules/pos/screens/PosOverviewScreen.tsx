import { Card } from "@/components/Card";
import type { PosSnapshot } from "@/modules/pos/pos-data";
import { computePosSummary } from "@/modules/pos/pos-summary";
import { formatMoney } from "@/components/form-fields";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="m-0 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="m-0 text-2xl font-extrabold">{value}</p>
      {hint ? <p className="m-0 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

export function PosOverviewScreen({ snapshot }: { snapshot: PosSnapshot }) {
  const summary = computePosSummary(snapshot.sales, snapshot.registers, snapshot.sessions);
  const pendingCount =
    snapshot.registers.filter((r) => r.hasPendingLocalChange).length +
    snapshot.sales.filter((s) => s.hasPendingLocalChange).length;

  return (
    <section aria-labelledby="pos-overview-heading" className="flex flex-col gap-4">
      <h2 id="pos-overview-heading" className="m-0 text-[1.05rem] font-bold">
        Overview
      </h2>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
        <Tile label="Registers" value={String(summary.registerCount)} />
        <Tile label="Open sessions" value={String(summary.openSessionCount)} />
        <Tile label="Today's sales" value={String(summary.todaySalesCount)} hint={`GHS ${formatMoney(String(summary.todaySalesTotal))}`} />
        <Tile label="All-time sales" value={String(summary.allTimeSalesCount)} hint={`GHS ${formatMoney(String(summary.allTimeSalesTotal))}`} />
      </div>
      {pendingCount > 0 ? (
        <Card>
          <p className="m-0 text-[0.8125rem]">
            {pendingCount} {pendingCount === 1 ? "change is" : "changes are"} waiting to sync. They already count above and are
            visible everywhere on this device, but the cloud copy will not reflect them until the next successful sync.
          </p>
        </Card>
      ) : null}
      {snapshot.registers.length === 0 ? (
        <Card>
          <p className="m-0 text-sm text-muted-foreground">
            No registers on this device yet. Sync once online, or add one from the Registers tab.
          </p>
        </Card>
      ) : null}
    </section>
  );
}
