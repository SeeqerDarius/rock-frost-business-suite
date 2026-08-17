import { useState } from "react";
import { useApp } from "@/state/AppProvider";
import { usePosSnapshot } from "@/modules/pos/pos-data";
import { PosOverviewScreen } from "@/modules/pos/screens/PosOverviewScreen";
import { PosRegistersScreen } from "@/modules/pos/screens/PosRegistersScreen";
import { PosSellScreen } from "@/modules/pos/screens/PosSellScreen";
import { PosSalesHistoryScreen } from "@/modules/pos/screens/PosSalesHistoryScreen";
import { PosReportsScreen } from "@/modules/pos/screens/PosReportsScreen";
import { PosSettingsScreen } from "@/modules/pos/screens/PosSettingsScreen";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "sell", label: "Sell" },
  { key: "registers", label: "Registers" },
  { key: "sales", label: "Sales history" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * POS's own multi-screen mini-app, used in place of the generic
 * ModuleDetailView demo widget (see AppShell.tsx): POS is the first module
 * with real, full offline parity, so it gets a real terminal instead of
 * the one-button "record example entry" placeholder every other module
 * still uses.
 */
export function PosModuleShell() {
  const { db } = useApp();
  const { snapshot, reload } = usePosSnapshot(db);
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <nav aria-label="POS sections" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", borderBottom: "1px solid var(--rf-border)", paddingBottom: "0.6rem" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "999px",
              border: "1px solid var(--rf-border)",
              background: tab === t.key ? "var(--rf-primary)" : "var(--rf-card)",
              color: tab === t.key ? "var(--rf-primary-foreground)" : "var(--rf-card-foreground)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? <PosOverviewScreen snapshot={snapshot} /> : null}
      {tab === "sell" ? <PosSellScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "registers" ? <PosRegistersScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "sales" ? <PosSalesHistoryScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "reports" ? <PosReportsScreen snapshot={snapshot} /> : null}
      {tab === "settings" ? <PosSettingsScreen snapshot={snapshot} onChanged={reload} /> : null}
    </div>
  );
}
