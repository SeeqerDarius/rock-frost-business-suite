"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OfflineOperationalCapture } from "@/app/app/(overview)/account/offline/operational-capture";
import { captureOfflineOperation } from "@/lib/pwa/offline-capture";
import { getOfflineLockConfig, listOfflineWorkPacks } from "@/lib/pwa/indexed-db";
import { unlockOfflineDevice } from "@/lib/pwa/offline-lock";
import type { OfflineWorkspaceSnapshot, OfflineWorkPack } from "@/lib/pwa/types";

export function OfflineWorkspace({ workspace }: { workspace: OfflineWorkspaceSnapshot }) {
  const [workPacks, setWorkPacks] = useState<OfflineWorkPack[]>([]);
  const [locked, setLocked] = useState(true);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [module, setModule] = useState(workspace.moduleKeys.find((key) => key !== "pos") ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => setWorkPacks(await listOfflineWorkPacks(workspace.organizationId, workspace.userId)), [workspace.organizationId, workspace.userId]);
  useEffect(() => { queueMicrotask(() => { void Promise.all([refresh(), getOfflineLockConfig(workspace.organizationId, workspace.userId).then((config) => setLocked(config?.enabled === true))]); }); }, [refresh, workspace.organizationId, workspace.userId]);

  async function unlock() {
    try { if (await unlockOfflineDevice(workspace.organizationId, workspace.userId)) setLocked(false); }
    catch { setMessage("The device could not verify your identity."); }
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    try {
      await captureOfflineOperation(workspace.organizationId, workspace.userId, { module, entityType: `${module}.safe-draft`, entityId: crypto.randomUUID(), operationType: "draft", baseServerVersion: 0, payloadSchemaVersion: 1, payload: { title, fields: { notes } }, attachmentReferences: [], dependencyIds: [] });
      setTitle(""); setNotes(""); setMessage("Draft saved on this device. It requires server review after reconnection.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The draft could not be saved."); }
  }

  return <article className="space-y-4 rounded-lg border p-4">
    <div><p className="font-medium">{workspace.organizationName}</p><p className="text-sm text-muted-foreground">Last synchronized {new Date(workspace.capturedAt).toLocaleString()}. Authorization expires {new Date(workspace.expiresAt).toLocaleString()}.</p></div>
    {message ? <p role="status" className="rounded border p-2 text-sm">{message}</p> : null}
    {locked ? <div className="space-y-2"><p className="text-sm">This workspace is protected by this device&apos;s biometric or PIN verification.</p><Button onClick={unlock}>Unlock workspace</Button></div> : <>
      <div className="space-y-2"><h3 className="font-medium">Downloaded snapshots</h3>{workPacks.length ? workPacks.map((pack) => <div key={pack.key} className="rounded border p-2 text-sm"><p>{pack.title}: synchronized {new Date(pack.downloadedAt).toLocaleString()}, expires {new Date(pack.expiresAt).toLocaleString()}.</p>{["pharmacy", "hospital"].includes(pack.module) ? <p className="font-medium text-amber-700 dark:text-amber-300">Clinical information is stale. Verify it online before clinical action.</p> : null}<details><summary className="cursor-pointer">View read-only snapshot</summary><pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(pack.records, null, 2)}</pre></details></div>) : <p className="text-sm text-muted-foreground">No module work pack was downloaded before connectivity was lost.</p>}</div>
      <OfflineOperationalCapture organizationId={workspace.organizationId} userId={workspace.userId} workPacks={workPacks} onSaved={refresh} />
      {module ? <form className="space-y-2 rounded-lg border p-3" onSubmit={saveDraft}><h3 className="font-medium">Safe offline draft</h3><select className="w-full rounded-md border bg-background p-2" value={module} onChange={(event) => setModule(event.target.value)}>{workspace.moduleKeys.filter((key) => key !== "pos").map((key) => <option key={key}>{key}</option>)}</select><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Draft title" required /><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Draft details" required /><Button>Save safely for later</Button></form> : null}
    </>}
  </article>;
}
