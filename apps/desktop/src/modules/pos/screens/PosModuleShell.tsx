import { useApp } from "@/state/AppProvider";
import { usePosSnapshot } from "@/modules/pos/pos-data";
import { PosOverviewScreen } from "@/modules/pos/screens/PosOverviewScreen";
import { PosRegistersScreen } from "@/modules/pos/screens/PosRegistersScreen";
import { PosSellScreen } from "@/modules/pos/screens/PosSellScreen";
import { PosSalesHistoryScreen } from "@/modules/pos/screens/PosSalesHistoryScreen";
import { PosReportsScreen } from "@/modules/pos/screens/PosReportsScreen";
import { PosSettingsScreen } from "@/modules/pos/screens/PosSettingsScreen";

/**
 * POS's own multi-screen mini-app, used in place of the generic
 * ModuleDetailView demo widget (see AppShell.tsx): POS is the first module
 * with real, full offline parity, so it gets a real terminal instead of
 * the one-button "record example entry" placeholder every other module
 * still uses. Screen selection lives in the sidebar (AppSidebar.tsx),
 * mirroring the web app's persistent left-nav pattern; this component only
 * owns the snapshot/reload wiring and renders whichever screen is active.
 */
export function PosModuleShell({ screen }: { screen: string }) {
  const { db } = useApp();
  const { snapshot, reload } = usePosSnapshot(db);

  switch (screen) {
    case "sell":
      return <PosSellScreen snapshot={snapshot} onChanged={reload} />;
    case "registers":
      return <PosRegistersScreen snapshot={snapshot} onChanged={reload} />;
    case "sales":
      return <PosSalesHistoryScreen snapshot={snapshot} onChanged={reload} />;
    case "reports":
      return <PosReportsScreen snapshot={snapshot} />;
    case "settings":
      return <PosSettingsScreen snapshot={snapshot} onChanged={reload} />;
    default:
      return <PosOverviewScreen snapshot={snapshot} />;
  }
}
