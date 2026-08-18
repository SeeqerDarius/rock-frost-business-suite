import { useState } from "react";
import { useApp } from "@/state/AppProvider";
import { usePosSnapshot } from "@/modules/pos/pos-data";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
        <TabsList aria-label="POS sections">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "overview" ? <PosOverviewScreen snapshot={snapshot} /> : null}
      {tab === "sell" ? <PosSellScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "registers" ? <PosRegistersScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "sales" ? <PosSalesHistoryScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "reports" ? <PosReportsScreen snapshot={snapshot} /> : null}
      {tab === "settings" ? <PosSettingsScreen snapshot={snapshot} onChanged={reload} /> : null}
    </div>
  );
}
