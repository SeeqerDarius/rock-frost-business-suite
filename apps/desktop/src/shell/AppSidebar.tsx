import { useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/Button";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppProvider";
import { ModuleLauncher } from "@/shell/ModuleLauncher";
import { ModuleDetailView } from "@/shell/ModuleDetailView";
import { PosModuleShell } from "@/modules/pos/screens/PosModuleShell";
import { SchoolModuleShell } from "@/modules/school/screens/SchoolModuleShell";
import { SyncStatusBar } from "@/shell/SyncStatusBar";
import { ConflictResolutionPanel } from "@/conflict/ConflictResolutionPanel";
import { POS_NAVIGATION, SCHOOL_NAVIGATION, DEMO_NAVIGATION, type ShellNavItem } from "@/shell/navigation";
import type { OfflineModuleKey } from "@/contract/sync-contract";

const SECTION_LABELS: Record<OfflineModuleKey, string> = {
  fleet: "Fleet",
  installment: "Installment",
  pos: "Point of Sale",
  inventory: "Inventory",
  school: "School Management",
};

function navigationFor(moduleKey: OfflineModuleKey): ShellNavItem[] {
  if (moduleKey === "pos") return POS_NAVIGATION;
  if (moduleKey === "school") return SCHOOL_NAVIGATION;
  return DEMO_NAVIGATION;
}

/** Mirrors the web app's src/components/navigation/sidebar-nav.tsx: grouped nav items with an active-state accent bar. */
function SidebarNav({ items, activeKey, onSelect }: { items: ShellNavItem[]; activeKey: string; onSelect: (key: string) => void }) {
  return (
    <nav aria-label="Section navigation" className="flex flex-col gap-0.5 px-2">
      {items.map((item, index) => {
        const isActive = item.key === activeKey;
        const showGroup = item.group !== items[index - 1]?.group;
        return (
          <div key={item.key}>
            {showGroup ? (
              <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                {item.group}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(item.key)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span className="shrink-0 [&_svg]:size-4" aria-hidden="true">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  const { device, signOut } = useApp();
  const enabledModuleKeys = useMemo(() => device?.enabledModuleKeys ?? [], [device]);
  const [selectedModule, setSelectedModule] = useState<OfflineModuleKey | null>(enabledModuleKeys[0] ?? null);
  const [activeKey, setActiveKey] = useState<string>("overview");

  if (!device) return null;

  function selectModule(moduleKey: OfflineModuleKey) {
    setSelectedModule(moduleKey);
    setActiveKey("overview");
  }

  const navItems = selectedModule ? navigationFor(selectedModule) : [];
  const sectionLabel = selectedModule ? SECTION_LABELS[selectedModule] : "Rock Frost Business Suite";
  const currentNavItem = navItems.find((item) => item.key === activeKey);

  return (
    <div className="flex min-h-screen bg-muted/20">
      <a href="#main-content" className="rf-skip-link">
        Skip to main content
      </a>

      <aside aria-label={`${sectionLabel} sidebar`} className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b px-4">
          <p className="m-0 truncate text-[0.9375rem] font-extrabold">Rock Frost</p>
        </div>
        {selectedModule ? (
          <p className="px-5 pb-2 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{sectionLabel}</p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {navItems.length > 0 ? (
            <SidebarNav items={navItems} activeKey={activeKey} onSelect={setActiveKey} />
          ) : (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              No offline modules are enabled for your organization on this account.
            </p>
          )}
        </div>
        <div className="border-t p-3">
          <p className="m-0 truncate text-xs font-semibold">{device.userName}</p>
          <p className="m-0 mb-2 truncate text-xs text-muted-foreground">{device.deviceName}</p>
          <Button variant="ghost" onClick={() => void signOut()} className="w-full justify-start text-muted-foreground">
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-sm font-semibold">{currentNavItem?.label ?? sectionLabel}</p>
            <p className="m-0 hidden truncate text-xs text-muted-foreground sm:block">{sectionLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <ModuleLauncher enabledModuleKeys={enabledModuleKeys} selected={selectedModule} onSelect={selectModule} />
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6">
          <SyncStatusBar />
          <ConflictResolutionPanel />

          {selectedModule === "pos" ? (
            <PosModuleShell screen={activeKey} />
          ) : selectedModule === "school" ? (
            <SchoolModuleShell screen={activeKey} />
          ) : selectedModule ? (
            <ModuleDetailView moduleKey={selectedModule} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
