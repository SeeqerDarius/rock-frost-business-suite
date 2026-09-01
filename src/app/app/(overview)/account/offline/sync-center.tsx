"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, Database, RefreshCw, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { estimateOfflineStorage, getOfflineDeviceRegistration, listOfflineOperations, purgeOfflineDataForUser } from "@/lib/pwa/indexed-db";
import type { OfflineDeviceRegistration, OfflineOperation } from "@/lib/pwa/types";
import { synchronizeQueuedSales } from "@/app/app/pos/sell/offline-queue";

function bytes(value?: number) {
  if (!value) return "0 MB";
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function OfflineSyncCenter({ organizationId, userId }: { organizationId: string; userId: string }) {
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [registration, setRegistration] = useState<OfflineDeviceRegistration | null>(null);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [nextOperations, nextRegistration, nextStorage] = await Promise.all([listOfflineOperations(organizationId, userId), getOfflineDeviceRegistration(organizationId, userId), estimateOfflineStorage()]);
    setOperations(nextOperations);
    setRegistration(nextRegistration);
    setStorage(nextStorage);
  }, [organizationId, userId]);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  async function retry() {
    setBusy(true); setMessage(null);
    try { await synchronizeQueuedSales(organizationId, userId); setMessage("Synchronization attempt finished. Review the current statuses below."); }
    catch { setMessage("Synchronization could not reach the server. Your queued work remains on this device."); }
    finally { await refresh(); setBusy(false); }
  }

  async function clearLocal() {
    if (!window.confirm("Clear all offline data for this signed-in account on this browser? Pending work that has not synchronized will be lost.")) return;
    await purgeOfflineDataForUser(userId);
    setMessage("Offline data for this account was cleared from this browser.");
    await refresh();
  }

  async function removeDevice() {
    if (!registration || !window.confirm("Remove this offline device? Pending work will be deleted after the server revokes it.")) return;
    setBusy(true);
    const response = await fetch(`/api/offline/devices?installationId=${encodeURIComponent(registration.installationId)}`, { method: "DELETE" });
    if (response.ok) { await purgeOfflineDataForUser(userId); setMessage("This browser was removed as an offline device."); }
    else setMessage("The server could not remove this device. Local pending work was preserved.");
    await refresh(); setBusy(false);
  }

  const pending = operations.filter((operation) => operation.status === "pending").length;
  const conflicts = operations.filter((operation) => operation.status === "conflict").length;
  const rejected = operations.filter((operation) => operation.status === "rejected").length;

  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <div><h1 className="text-2xl font-semibold">Offline access and Sync Center</h1><p className="text-sm text-muted-foreground">See what is stored locally and whether each action is pending, synchronized, rejected, or conflicted.</p></div>
    {message ? <p role="status" aria-live="polite" className="rounded-lg border p-3 text-sm">{message}</p> : null}
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>Pending</CardDescription><CardTitle>{pending}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Conflicts</CardDescription><CardTitle>{conflicts}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Rejected</CardDescription><CardTitle>{rejected}</CardTitle></CardHeader></Card></div>
    <Card><CardHeader><div className="flex items-center gap-2"><Database className="size-5" /><CardTitle>Local storage</CardTitle></div><CardDescription>Browser storage is origin-isolated but is not a secure hardware vault.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p>Used: {bytes(storage?.usage)} of approximately {bytes(storage?.quota)}</p><p>Device: {registration ? "Registered" : "Not registered"}</p><p>Offline access until: {registration ? new Date(registration.offlineAccessUntil).toLocaleString() : "Not available"}</p><p>Modules: {registration?.moduleKeys.join(", ") || "None"}</p></CardContent></Card>
    <Card><CardHeader><div className="flex items-center gap-2"><CloudOff className="size-5" /><CardTitle>Queued actions</CardTitle></div><CardDescription>Only server responses can mark an action applied. Conflicts and permanent failures are never retried forever.</CardDescription></CardHeader><CardContent className="space-y-3">{operations.length ? operations.map((operation) => <article key={operation.operationId} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{operation.module}: {operation.operationType}</p><span className="rounded-full bg-muted px-2 py-0.5">{operation.status}</span></div><p className="text-muted-foreground">Recorded {new Date(operation.clientTimestamp).toLocaleString()}</p>{operation.lastError ? <p className="mt-1 text-destructive">{operation.lastError}</p> : null}</article>) : <p className="text-sm text-muted-foreground">No actions are waiting on this device.</p>}<Button onClick={retry} disabled={busy || !pending} className="gap-2"><RefreshCw className="size-4" />Retry pending actions</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>Device controls</CardTitle><CardDescription>Clearing local data cannot be undone. Removing the device revokes it on the server first.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" onClick={clearLocal} disabled={busy} className="gap-2"><Trash2 className="size-4" />Clear offline data</Button><Button variant="destructive" onClick={removeDevice} disabled={busy || !registration} className="gap-2"><Unplug className="size-4" />Remove this device</Button></CardContent></Card>
  </div>;
}
