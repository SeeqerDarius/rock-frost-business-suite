"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, Database, Download, RefreshCw, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { estimateOfflineStorage, getOfflineDeviceRegistration, getOfflineLockConfig, listOfflineConflicts, listOfflineOperations, listOfflineSyncAttempts, listOfflineWorkPacks, purgeOfflineDataForUser, removeOfflineConflict, removeOfflineOperation } from "@/lib/pwa/indexed-db";
import type { OfflineConflictRecord, OfflineDeviceRegistration, OfflineOperation, OfflineSyncAttempt, OfflineWorkPack } from "@/lib/pwa/types";
import { synchronizeQueuedSales } from "@/app/app/pos/sell/offline-queue";
import { captureOfflineOperation, downloadOfflineWorkPack } from "@/lib/pwa/offline-capture";
import { OfflineOperationalCapture } from "./operational-capture";
import { disableOfflineDeviceLock, enableOfflineDeviceLock, supportsOfflineDeviceLock } from "@/lib/pwa/offline-lock";

function bytes(value?: number) {
  if (!value) return "0 MB";
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function OfflineSyncCenter({ organizationId, organizationName, userId }: { organizationId: string; organizationName: string; userId: string }) {
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [registration, setRegistration] = useState<OfflineDeviceRegistration | null>(null);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number } | null>(null);
  const [workPacks, setWorkPacks] = useState<OfflineWorkPack[]>([]);
  const [conflictRecords, setConflictRecords] = useState<OfflineConflictRecord[]>([]);
  const [attempts, setAttempts] = useState<OfflineSyncAttempt[]>([]);
  const [draftModule, setDraftModule] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [nextOperations, nextRegistration, nextStorage, nextWorkPacks, nextConflicts, nextAttempts, nextLock] = await Promise.all([listOfflineOperations(organizationId, userId), getOfflineDeviceRegistration(organizationId, userId), estimateOfflineStorage(), listOfflineWorkPacks(organizationId, userId), listOfflineConflicts(organizationId, userId), listOfflineSyncAttempts(organizationId, userId), getOfflineLockConfig(organizationId, userId)]);
    setOperations(nextOperations);
    setRegistration(nextRegistration);
    setStorage(nextStorage);
    setWorkPacks(nextWorkPacks);
    setConflictRecords(nextConflicts);
    setAttempts(nextAttempts.sort((left, right) => right.startedAt.localeCompare(left.startedAt)).slice(0, 10));
    setLockEnabled(nextLock?.enabled === true);
    if (!draftModule && nextRegistration?.moduleKeys.length) setDraftModule(nextRegistration.moduleKeys.find((module) => module !== "pos") ?? "");
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

  async function download(module: string) {
    setBusy(true); setMessage(null);
    try { await downloadOfflineWorkPack(organizationId, userId, module); setMessage(`${module} work pack downloaded. It is labelled with its expiry and last synchronization time.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The work pack could not be downloaded."); }
    finally { await refresh(); setBusy(false); }
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!draftModule || !draftTitle.trim() || !draftNotes.trim()) return;
    setBusy(true); setMessage(null);
    try {
      await captureOfflineOperation(organizationId, userId, { module: draftModule, entityType: `${draftModule}.safe-draft`, entityId: crypto.randomUUID(), operationType: "draft", baseServerVersion: 0, payloadSchemaVersion: 1, payload: { title: draftTitle.trim(), fields: { notes: draftNotes.trim() } }, attachmentReferences: [], dependencyIds: [] }, draftFiles);
      setDraftTitle(""); setDraftNotes(""); setDraftFiles([]); setMessage("Draft saved safely on this device. It is not posted, approved, paid, verified, reconciled, dispensed, or finalized.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The offline draft could not be saved."); }
    finally { await refresh(); setBusy(false); }
  }

  async function resolveConflict(conflictId: string, resolution: "KEEP_SERVER" | "MANAGER_REVIEW") {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/offline/conflicts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conflictId, resolution }) });
      if (!response.ok) throw new Error(`Conflict action failed with HTTP ${response.status}.`);
      if (resolution === "KEEP_SERVER") {
        const conflict = conflictRecords.find((item) => item.conflictId === conflictId);
        await removeOfflineConflict(conflictId);
        if (conflict) await removeOfflineOperation(conflict.operationId);
      }
      setMessage(resolution === "KEEP_SERVER" ? "The authoritative server value was kept." : "Manager review was requested. The conflict remains open.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The conflict action failed."); }
    finally { await refresh(); setBusy(false); }
  }

  async function toggleDeviceLock() {
    setBusy(true); setMessage(null);
    try {
      if (lockEnabled) { await disableOfflineDeviceLock(organizationId, userId); setMessage("Offline device lock disabled."); }
      else { await enableOfflineDeviceLock(organizationId, organizationName, userId); setMessage("Offline device lock enabled. The device will require biometric or PIN verification on the next app start."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "The device lock setting could not be changed."); }
    finally { await refresh(); setBusy(false); }
  }

  const pending = operations.filter((operation) => operation.status === "pending").length;
  const conflicts = operations.filter((operation) => operation.status === "conflict").length;
  const rejected = operations.filter((operation) => operation.status === "rejected").length;

  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <div><h1 className="text-2xl font-semibold">Offline access and Sync Center</h1><p className="text-sm text-muted-foreground">See what is stored locally and whether each action is pending, synchronized, rejected, or conflicted.</p></div>
    {message ? <p role="status" aria-live="polite" className="rounded-lg border p-3 text-sm">{message}</p> : null}
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>Pending</CardDescription><CardTitle>{pending}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Conflicts</CardDescription><CardTitle>{conflicts}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Rejected</CardDescription><CardTitle>{rejected}</CardTitle></CardHeader></Card></div>
    <Card><CardHeader><div className="flex items-center gap-2"><Database className="size-5" /><CardTitle>Local storage</CardTitle></div><CardDescription>Browser storage is origin-isolated but is not a secure hardware vault.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p>Used: {bytes(storage?.usage)} of approximately {bytes(storage?.quota)}</p><p>Device: {registration ? "Registered" : "Not registered"}</p><p>Offline access until: {registration ? new Date(registration.offlineAccessUntil).toLocaleString() : "Not available"}</p><p>Modules: {registration?.moduleKeys.join(", ") || "None"}</p></CardContent></Card>
    <Card><CardHeader><div className="flex items-center gap-2"><Download className="size-5" /><CardTitle>Downloaded work packs</CardTitle></div><CardDescription>Downloads are bounded, device-specific snapshots. They expire automatically and never include authentication secrets or unrestricted clinical records.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2">{registration?.moduleKeys.map((module) => <Button key={module} type="button" variant="outline" disabled={busy || typeof navigator === "undefined" || !navigator.onLine} onClick={() => download(module)}>Download {module}</Button>)}</div>{workPacks.length ? <div className="space-y-2">{workPacks.map((pack) => <article key={pack.key} className="rounded-lg border p-3 text-sm"><p className="font-medium">{pack.title}</p><p className="text-muted-foreground">Last synchronized {new Date(pack.downloadedAt).toLocaleString()}. Expires {new Date(pack.expiresAt).toLocaleString()}. {bytes(pack.sizeBytes)}.</p>{["pharmacy", "hospital"].includes(pack.module) ? <p className="mt-1 font-medium text-amber-700 dark:text-amber-300">Clinical information is a stale, minimized snapshot. Verify it online before clinical action.</p> : null}<details className="mt-2"><summary className="cursor-pointer">View read-only snapshot</summary><pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(pack.records, null, 2)}</pre></details></article>)}</div> : <p className="text-sm text-muted-foreground">No work packs are downloaded.</p>}</CardContent></Card>
    <Card><CardContent className="pt-6"><OfflineOperationalCapture organizationId={organizationId} userId={userId} workPacks={workPacks} onSaved={refresh} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Safe offline draft</CardTitle><CardDescription>Drafts synchronize for server-side review. They never count as money received, stock moved, medication dispensed, a result verified, or a workflow approved.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={saveDraft}><label className="block text-sm font-medium">Module<select className="mt-1 w-full rounded-md border bg-background p-2" value={draftModule} onChange={(event) => setDraftModule(event.target.value)}>{registration?.moduleKeys.filter((module) => module !== "pos").map((module) => <option key={module} value={module}>{module}</option>)}</select></label><label className="block text-sm font-medium">Draft title<Input className="mt-1" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={200} required /></label><label className="block text-sm font-medium">Draft details<Textarea className="mt-1" value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} maxLength={5000} required /></label><label className="block text-sm font-medium">Optional evidence<Input className="mt-1" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setDraftFiles(Array.from(event.target.files ?? []))} /></label><Button disabled={busy || !draftModule}>Save safely for later</Button></form></CardContent></Card>
    <Card><CardHeader><div className="flex items-center gap-2"><CloudOff className="size-5" /><CardTitle>Queued actions</CardTitle></div><CardDescription>Only server responses can mark an action applied. Conflicts and permanent failures are never retried forever.</CardDescription></CardHeader><CardContent className="space-y-3">{operations.length ? operations.map((operation) => <article key={operation.operationId} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{operation.module}: {operation.operationType}</p><span className="rounded-full bg-muted px-2 py-0.5">{operation.status}</span></div><p className="text-muted-foreground">Recorded {new Date(operation.clientTimestamp).toLocaleString()}</p>{operation.lastError ? <p className="mt-1 text-destructive">{operation.lastError}</p> : null}</article>) : <p className="text-sm text-muted-foreground">No actions are waiting on this device.</p>}<Button onClick={retry} disabled={busy || !pending} className="gap-2"><RefreshCw className="size-4" />Retry pending actions</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>Conflict Center</CardTitle><CardDescription>Protected records are never resolved by last write wins. Compare the local value and authoritative server value before choosing an allowed action.</CardDescription></CardHeader><CardContent className="space-y-3">{conflictRecords.filter((conflict) => conflict.status === "open").length ? conflictRecords.filter((conflict) => conflict.status === "open").map((conflict) => <article key={conflict.conflictId} className="space-y-2 rounded-lg border p-3 text-sm"><p className="font-medium">{conflict.module}: {conflict.workflow}</p><p>Local timestamp: {new Date(conflict.localChangedAt).toLocaleString()}</p><p>Server timestamp: {conflict.serverChangedAt ? new Date(conflict.serverChangedAt).toLocaleString() : "Unavailable"}</p><details><summary className="cursor-pointer">Compare values</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><pre className="overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(conflict.localValue, null, 2)}</pre><pre className="overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(conflict.serverValue, null, 2)}</pre></div></details><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => resolveConflict(conflict.conflictId, "KEEP_SERVER")}>Keep server value</Button><Button size="sm" disabled={busy} onClick={() => resolveConflict(conflict.conflictId, "MANAGER_REVIEW")}>Request manager review</Button></div></article>) : <p className="text-sm text-muted-foreground">No conflicts require attention.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Recent synchronization attempts</CardTitle></CardHeader><CardContent className="space-y-2">{attempts.length ? attempts.map((attempt) => <p key={attempt.attemptId} className="text-sm">{new Date(attempt.startedAt).toLocaleString()}: {attempt.outcome}, {attempt.operationCount} action(s).</p>) : <p className="text-sm text-muted-foreground">No synchronization attempts recorded.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Device controls</CardTitle><CardDescription>Clearing local data cannot be undone. Removing the device revokes it on the server first.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{typeof navigator !== "undefined" && supportsOfflineDeviceLock() ? <Button variant="outline" onClick={toggleDeviceLock} disabled={busy}>{lockEnabled ? "Disable" : "Enable"} biometric or PIN lock</Button> : null}<Button variant="outline" onClick={clearLocal} disabled={busy} className="gap-2"><Trash2 className="size-4" />Clear offline data</Button><Button variant="destructive" onClick={removeDevice} disabled={busy || !registration} className="gap-2"><Unplug className="size-4" />Remove this device</Button></CardContent></Card>
  </div>;
}
