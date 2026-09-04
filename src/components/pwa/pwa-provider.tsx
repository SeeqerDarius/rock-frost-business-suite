"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, Download, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOfflineLockConfig, listOfflineOperations, listWorkspaceSnapshots, purgeOfflineDataForUser, saveOfflineDeviceRegistration, saveWorkspaceSnapshot, workspacePartitionKey } from "@/lib/pwa/indexed-db";
import type { OfflineWorkspaceSnapshot, PwaConnectivityState } from "@/lib/pwa/types";
import { synchronizeOfflineOperations } from "@/lib/pwa/sync-client";
import { unlockOfflineDevice } from "@/lib/pwa/offline-lock";

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
  const [sessionExpired, setSessionExpired] = useState(false);
  const [syncState, setSyncState] = useState<PwaConnectivityState | null>(null);
  const [lockChecked, setLockChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
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
    void listWorkspaceSnapshots().then(async (workspaces) => {
      const previous = workspaces.find((entry) => entry.partitionKey === snapshot.partitionKey);
      if (previous && JSON.stringify([...previous.permissions].sort()) !== JSON.stringify([...snapshot.permissions].sort())) await purgeOfflineDataForUser(workspace.userId);
      await saveWorkspaceSnapshot(snapshot);
    }).catch(() => undefined);
    const installationKey = "rf-pwa-installation-id";
    let installationId = window.localStorage.getItem(installationKey);
    if (!installationId) {
      installationId = crypto.randomUUID();
      window.localStorage.setItem(installationKey, installationId);
    }
    void crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]).then(async (keyPair) => {
      const [signingPublicKey, signingPrivateKey] = await Promise.all([
        crypto.subtle.exportKey("jwk", keyPair.publicKey),
        crypto.subtle.exportKey("jwk", keyPair.privateKey),
      ]);
      return fetch("/api/offline/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installationId, name: navigator.userAgent.slice(0, 100), platform: navigator.platform || "web", moduleKeys: workspace.moduleKeys, signingPublicKey }),
      }).then(async (response) => ({ response, signingPrivateKey }));
    }).then(async ({ response, signingPrivateKey }) => {
      if (response.status === 401) {
        // A genuine invalid session - distinct from 403, which this endpoint
        // also returns for "offline-disabled" (the default, expected state
        // for every organization the platform owner hasn't granted offline
        // access - see toggleOrganizationOfflineAccess). Treating that 403
        // as a session problem showed every user, in every organization
        // that has never been granted offline access (effectively all of
        // them today), a permanent "session expired" banner with no way to
        // clear it.
        setSessionExpired(true);
        await purgeOfflineDataForUser(workspace.userId).catch(() => undefined);
        return;
      }
      if (!response.ok) return;
      const registration = await response.json() as { deviceId: string; organizationId: string; userId: string; moduleKeys: string[]; offlineAccessUntil: string; mutationKillSwitch: boolean };
      await saveOfflineDeviceRegistration({ ...registration, signingPrivateKey, installationId: installationId!, key: `device:${registration.organizationId}:${registration.userId}` });
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

  useEffect(() => {
    let active = true;
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("rock-frost-offline-sync");
    async function refreshState() {
      const operations = await listOfflineOperations(workspace.organizationId, workspace.userId).catch(() => []);
      if (!active) return;
      if (operations.some((operation) => operation.status === "conflict")) setSyncState("conflict");
      else if (operations.some((operation) => operation.status === "rejected")) setSyncState("sync-failed");
      else if (operations.some((operation) => operation.status === "pending")) setSyncState("partially-synchronized");
      else setSyncState(null);
    }
    async function synchronize() {
      if (!navigator.onLine) return refreshState();
      const operations = await listOfflineOperations(workspace.organizationId, workspace.userId).catch(() => []);
      if (!operations.some((operation) => operation.status === "pending")) return refreshState();
      setSyncState("synchronizing");
      try { await synchronizeOfflineOperations(workspace.organizationId, workspace.userId); }
      catch { if (active) setSyncState("sync-failed"); return; }
      await refreshState();
    }
    channel?.addEventListener("message", refreshState);
    window.addEventListener("online", synchronize);
    void refreshState();
    return () => { active = false; channel?.close(); window.removeEventListener("online", synchronize); };
  }, [workspace.organizationId, workspace.userId]);

  useEffect(() => {
    void getOfflineLockConfig(workspace.organizationId, workspace.userId).then((config) => { setLocked(config?.enabled === true); setLockChecked(true); }).catch(() => setLockChecked(true));
  }, [workspace.organizationId, workspace.userId]);

  const state: PwaConnectivityState = waitingWorker ? "update-available" : sessionExpired ? "session-expired" : registrationFailed ? "sync-failed" : !online ? "offline" : syncState ?? "online";
  const install = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  async function unlock() {
    setUnlockError(null);
    try { if (await unlockOfflineDevice(workspace.organizationId, workspace.userId)) setLocked(false); }
    catch { setUnlockError("The device could not verify your identity. Try again."); }
  }

  if (!lockChecked) return <div className="grid min-h-screen place-items-center p-6"><p role="status">Checking offline device security...</p></div>;
  if (locked) return <div className="grid min-h-screen place-items-center p-6"><div className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-6 text-center shadow"><h1 className="text-xl font-semibold">Unlock offline access</h1><p className="text-sm text-muted-foreground">Use this device&apos;s biometric or PIN check before viewing locally stored Rock Frost data.</p>{unlockError ? <p role="alert" className="text-sm text-destructive">{unlockError}</p> : null}<Button onClick={unlock}>Unlock</Button></div></div>;

  // Silent in the common case: nothing to report when fully online with no
  // pending sync, no conflict, no update, and no real session problem. A
  // permanent pill sitting over the header at all times - even saying
  // "Online" - was pure noise and collided with the header's own controls
  // (the account menu sits in the same top-right corner). Only surface this
  // when there's actually something the user or an install prompt needs.
  const showBadge = state !== "online" || Boolean(installPrompt);

  return (
    <>
      {showBadge ? (
        // Positioned below the sticky header (h-16) rather than at the
        // viewport's own top edge, so it never overlaps the header's own
        // top-right controls (the account menu) regardless of what else is
        // showing there (module launcher, trial/subscription pill).
        <div className="fixed right-3 top-20 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur" role="status" aria-live="polite">
          {state === "online" ? <Cloud className="size-3.5 text-emerald-600" /> : state === "offline" ? <CloudOff className="size-3.5 text-amber-600" /> : <TriangleAlert className="size-3.5 text-amber-600" />}
          <span>{state === "online" ? "Online" : state === "offline" ? "Offline. Server confirmation is unavailable." : state === "update-available" ? "Update available" : state === "synchronizing" ? "Synchronizing" : state === "partially-synchronized" ? "Actions are waiting to synchronize" : state === "conflict" ? "Conflict requires attention" : state === "session-expired" ? "Offline session expired. Local access was cleared." : "Offline synchronization failed"}</span>
          {installPrompt ? <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5" onClick={install}><Download className="size-3" /> Install</Button> : null}
          {waitingWorker ? <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5" onClick={() => waitingWorker.postMessage({ type: "ACTIVATE_UPDATE" })}><RefreshCw className="size-3" /> Update</Button> : null}
        </div>
      ) : null}
      {iosGuidance ? <aside className="fixed bottom-3 left-3 z-40 max-w-sm rounded-lg border bg-background/95 p-3 text-sm shadow backdrop-blur" aria-label="Install Rock Frost"><p className="font-medium">Install on iPhone or iPad</p><p className="text-muted-foreground">Open Safari&apos;s Share menu, then choose Add to Home Screen.</p></aside> : null}
      {children}
    </>
  );
}
