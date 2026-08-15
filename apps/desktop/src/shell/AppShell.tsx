import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/Button";
import { useApp } from "@/state/AppProvider";
import { ModuleLauncher } from "@/shell/ModuleLauncher";
import { ModuleDetailView } from "@/shell/ModuleDetailView";
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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <a href="#main-content" className="rf-skip-link">
        Skip to main content
      </a>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "0.85rem 1.25rem",
          borderBottom: "1px solid var(--rf-border)",
          background: "var(--rf-card)",
        }}
      >
        <div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: "0.9375rem" }}>Rock Frost Business Suite</p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
            {device.userName} &middot; {device.deviceName}
          </p>
        </div>
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </Button>
      </header>

      <main id="main-content" tabIndex={-1} style={{ flex: 1, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "72rem", width: "100%", margin: "0 auto" }}>
        <SyncStatusBar />
        <ConflictResolutionPanel />

        <section aria-labelledby="modules-heading">
          <h2 id="modules-heading" className="rf-sr-only">
            Modules
          </h2>
          <ModuleLauncher enabledModuleKeys={device.enabledModuleKeys} selected={selectedModule} onSelect={setSelectedModule} />
        </section>

        {selectedModule ? <ModuleDetailView moduleKey={selectedModule} /> : null}
      </main>
    </div>
  );
}
