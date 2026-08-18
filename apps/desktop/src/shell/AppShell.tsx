import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/Button";
import { useApp } from "@/state/AppProvider";
import { ModuleLauncher } from "@/shell/ModuleLauncher";
import { ModuleDetailView } from "@/shell/ModuleDetailView";
import { PosModuleShell } from "@/modules/pos/screens/PosModuleShell";
import { SchoolModuleShell } from "@/modules/school/screens/SchoolModuleShell";
import { SyncStatusBar } from "@/shell/SyncStatusBar";
import { ConflictResolutionPanel } from "@/conflict/ConflictResolutionPanel";
import type { OfflineModuleKey } from "@/contract/sync-contract";

/** Any of these DOM events counts as "the user is present" for the inactivity lock timer (security/device-lock.ts). Attached once at the shell root rather than per-component. */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];

export function AppShell() {
  const { device, signOut, syncNow, recordActivity } = useApp();
  const [selectedModule, setSelectedModule] = useState<OfflineModuleKey | null>(null);

  useEffect(() => {
    const handler = () => recordActivity();
    for (const eventName of ACTIVITY_EVENTS) window.addEventListener(eventName, handler, { passive: true });
    return () => {
      for (const eventName of ACTIVITY_EVENTS) window.removeEventListener(eventName, handler);
    };
  }, [recordActivity]);

  // A first sync as soon as the shell mounts (e.g. right after activation,
  // or on every app relaunch): in addition to the manual "Sync now"
  // button, so a returning user doesn't have to remember to press it.
  useEffect(() => {
    void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!device) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="rf-skip-link">
        Skip to main content
      </a>

      <header className="flex items-center justify-between gap-4 border-b bg-card px-5 py-3.5">
        <div>
          <p className="m-0 text-[0.9375rem] font-extrabold">Rock Frost Business Suite</p>
          <p className="m-0 text-xs text-muted-foreground">
            {device.userName} &middot; {device.deviceName}
          </p>
        </div>
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </Button>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
        <SyncStatusBar />
        <ConflictResolutionPanel />

        <section aria-labelledby="modules-heading">
          <h2 id="modules-heading" className="rf-sr-only">
            Modules
          </h2>
          <ModuleLauncher enabledModuleKeys={device.enabledModuleKeys} selected={selectedModule} onSelect={setSelectedModule} />
        </section>

        {selectedModule === "pos" ? (
          <PosModuleShell />
        ) : selectedModule === "school" ? (
          <SchoolModuleShell />
        ) : selectedModule ? (
          <ModuleDetailView moduleKey={selectedModule} />
        ) : null}
      </main>
    </div>
  );
}
