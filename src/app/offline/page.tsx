"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listWorkspaceSnapshots } from "@/lib/pwa/indexed-db";
import type { OfflineWorkspaceSnapshot } from "@/lib/pwa/types";
import { OfflineWorkspace } from "./offline-workspace";

export default function OfflinePage() {
  const [workspaces, setWorkspaces] = useState<OfflineWorkspaceSnapshot[]>([]);
  useEffect(() => { void listWorkspaceSnapshots().then(setWorkspaces).catch(() => setWorkspaces([])); }, []);
  return (
    <main id="main-content" className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <CloudOff className="size-10 text-amber-600" />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Rock Frost is offline</h1>
        <p className="text-muted-foreground">Server actions cannot be confirmed right now. Cached workspace access expires automatically and may be removed when permissions change.</p>
      </div>
      {workspaces.length ? <section className="space-y-3" aria-labelledby="cached-workspaces"><h2 id="cached-workspaces" className="text-lg font-semibold">Authorized cached workspaces</h2>{workspaces.map((workspace) => <OfflineWorkspace key={workspace.partitionKey} workspace={workspace} />)}</section> : <p className="rounded-lg border p-4 text-sm">No unexpired workspace snapshot is available on this device.</p>}
      <Button onClick={() => window.location.reload()} className="w-fit gap-2"><RefreshCw className="size-4" /> Try again</Button>
      <Link className="text-sm underline" href="/login">Return to sign in</Link>
    </main>
  );
}
