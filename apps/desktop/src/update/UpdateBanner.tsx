import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/Button";
import { DesktopUpdateService, type UpdateCheckState } from "@/update/update-service";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;

function progressLabel(state: Extract<UpdateCheckState, { status: "downloading" }>) {
  if (!state.totalBytes) return "Downloading update";
  return `Downloading update ${Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100))}%`;
}

export function UpdateBanner() {
  const service = useMemo(() => new DesktopUpdateService(), []);
  const [state, setState] = useState<UpdateCheckState>(service.getState());

  useEffect(() => service.subscribe(setState), [service]);

  useEffect(() => {
    const checkWhenOnline = () => {
      if (navigator.onLine) void service.check();
    };
    checkWhenOnline();
    const interval = window.setInterval(checkWhenOnline, CHECK_INTERVAL_MS);
    window.addEventListener("online", checkWhenOnline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", checkWhenOnline);
    };
  }, [service]);

  if (state.status === "idle" || state.status === "current") return null;

  const busy = state.status === "checking" || state.status === "downloading" || state.status === "installing";
  const message =
    state.status === "checking" ? "Checking for application updates" :
    state.status === "downloading" ? progressLabel(state) :
    state.status === "installing" ? "Installing update. The application will restart." :
    state.status === "error" ? state.message :
    `Version ${state.update.version} is ready to install.`;

  return (
    <section
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.75rem",
        padding: "0.875rem 1rem",
        position: "fixed",
        zIndex: 80,
        top: "1rem",
        right: "1rem",
        width: "min(30rem, calc(100vw - 2rem))",
        border: "1px solid var(--rf-border)",
        borderRadius: "var(--rf-radius-lg)",
        background: "var(--rf-card)",
        boxShadow: "var(--rf-shadow-md)",
      }}
    >
      <div style={{ flex: "1 1 20rem" }}>
        <strong style={{ display: "block", fontSize: "0.875rem" }}>Application update</strong>
        <span style={{ fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>{message}</span>
      </div>
      {state.status === "available" ? (
        <Button onClick={() => void service.install(state.update)}>
          <Download size={14} aria-hidden="true" />
          Update and restart
        </Button>
      ) : null}
      {state.status === "error" ? (
        <Button variant="secondary" onClick={() => void service.check()}>
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </Button>
      ) : null}
      {busy ? <span className="rf-sr-only">Update operation in progress</span> : null}
    </section>
  );
}
