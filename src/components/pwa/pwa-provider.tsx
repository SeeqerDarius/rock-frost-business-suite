"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, Download, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveOfflineDeviceRegistration, saveWorkspaceSnapshot, workspacePartitionKey } from "@/lib/pwa/indexed-db";
import type { OfflineWorkspaceSnapshot, PwaConnectivityState } from "@/lib/pwa/types";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaProviderProps {
  workspace: Omit<OfflineWorkspaceSnapshot, "partitionKey" | "capturedAt" | "expiresAt">;
  children: React.ReactNode;
}

const OFFLINE_LEASE_MS = 12 * 60 * 60 * 1000;

export function PwaProvider({ workspace, children }: PwaProviderProps) {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [iosGuidance] = useState(() => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches);

  const snapshot = useMemo<OfflineWorkspaceSnapshot>(() => {
    const capturedAt = new Date();
    return {
      ...workspace,
      partitionKey: workspacePartitionKey(workspace.organizationId, workspace.userId),
      capturedAt: capturedAt.toISOString(),
      expiresAt: new Date(capturedAt.getTime() + OFFLINE_LEASE_MS).toISOString(),
    };
  }, [workspace]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstall);
    void saveWorkspaceSnapshot(snapshot).catch(() => undefined);
    const installationKey = "rf-pwa-installation-id";
    let installationId = window.localStorage.getItem(installationKey);
    if (!installationId) {
      installationId = crypto.randomUUID();
      window.localStorage.setItem(installationKey, installationId);
    }
    void fetch("/api/offline/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installationId, name: navigator.userAgent.slice(0, 100), platform: navigator.platform || "web", moduleKeys: workspace.moduleKeys }),
    }).then(async (response) => {
      if (!response.ok) return;
      const registration = await response.json() as { deviceId: string; organizationId: string; userId: string; moduleKeys: string[]; offlineAccessUntil: string; mutationKillSwitch: boolean };
      await saveOfflineDeviceRegistration({ ...registration, installationId: installationId!, key: `device:${registration.organizationId}:${registration.userId}` });
    }).catch(() => undefined);

    let reloading = false;
    const controllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", controllerChange);
    void navigator.serviceWorker?.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker);
            if (worker.state === "redundant") setRegistrationFailed(true);
          });
        });
      })
      .catch(() => setRegistrationFailed(true));
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstall);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChange);
    };
  }, [snapshot]);

  const state: PwaConnectivityState = waitingWorker ? "update-available" : registrationFailed ? "sync-failed" : online ? "online" : "offline";
  const install = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  return (
    <>
      <div className="fixed right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur" role="status" aria-live="polite">
        {state === "online" ? <Cloud className="size-3.5 text-emerald-600" /> : state === "offline" ? <CloudOff className="size-3.5 text-amber-600" /> : <TriangleAlert className="size-3.5 text-amber-600" />}
        <span>{state === "online" ? "Online" : state === "offline" ? "Offline. Server confirmation is unavailable." : state === "update-available" ? "Update available" : "Offline support needs attention"}</span>
        {installPrompt ? <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5" onClick={install}><Download className="size-3" /> Install</Button> : null}
        {waitingWorker ? <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5" onClick={() => waitingWorker.postMessage({ type: "ACTIVATE_UPDATE" })}><RefreshCw className="size-3" /> Update</Button> : null}
      </div>
      {iosGuidance ? <p className="sr-only">On iPhone or iPad, use Share, then Add to Home Screen to install Rock Frost.</p> : null}
      {children}
    </>
  );
}
