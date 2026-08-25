"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { BACKUP_MODULES } from "@/lib/backup/scopes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BackupControls({ tenantCode, twoFactorEnabled, activeModules, canExport, canRestore }: { tenantCode: string; twoFactorEnabled: boolean; activeModules: readonly (typeof BACKUP_MODULES)[number][]; canExport: boolean; canRestore: boolean }) {
  const [scope, setScope] = useState("all");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function restore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const response = await fetch("/api/organization/backup/restore", { method: "POST", body: new FormData(event.currentTarget) });
    const result = await response.json() as { error?: string; restored?: number; models?: number };
    setMessage(response.ok ? `Restore completed: ${result.restored ?? 0} records across ${result.models ?? 0} data models.` : result.error ?? "Restore failed.");
    setPending(false);
  }

  return <div className="grid gap-6 lg:grid-cols-2">
    {canExport ? <section className="space-y-4 rounded-lg border p-5">
      <div><h2 className="font-semibold">Export organization data</h2><p className="text-sm text-muted-foreground">Export all active module data or one active module. Authentication, passwords, inactive modules, platform records, and other organizations are excluded.</p></div>
      {activeModules.length ? <><div className="space-y-2"><Label>Backup scope</Label><Select value={scope} onValueChange={(value) => value && setScope(value)} items={{ all: "All active modules", ...Object.fromEntries(activeModules.map((module) => [module, module[0].toUpperCase() + module.slice(1)])) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All active modules</SelectItem>{activeModules.map((module) => <SelectItem value={module} key={module}>{module[0].toUpperCase() + module.slice(1)}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex flex-wrap gap-2"><Button nativeButton={false} render={<a href={`/api/organization/backup/excel?module=${scope}`} download />}><FileSpreadsheet />Export Excel</Button><Button variant="outline" nativeButton={false} render={<a href={`/api/organization/backup?module=${scope}`} download />}><Download />Download system backup (JSON)</Button></div><p className="text-xs text-muted-foreground">Excel is for viewing and reporting. Keep the JSON file when you need a restorable system backup.</p></> : <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">No active modules are available to export.</p>}
    </section> : null}
    {canRestore ? <section className="space-y-4 rounded-lg border p-5">
      <div><h2 className="font-semibold">Merge restore</h2><p className="text-sm text-muted-foreground">Restores matching records and adds missing records without deleting newer data. Only this organization&apos;s currently active module data is accepted.</p></div>
      <form onSubmit={restore} className="space-y-3">
        <div className="space-y-2"><Label htmlFor="backup">Backup JSON (maximum 4 MB)</Label><Input id="backup" name="backup" type="file" accept="application/json,.json" required /></div>
        <div className="space-y-2"><Label htmlFor="confirmation">Type RESTORE {tenantCode}</Label><Input id="confirmation" name="confirmation" required /></div>
        <div className="space-y-2"><Label htmlFor="backup-password">Current password</Label><Input id="backup-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
        {twoFactorEnabled ? <div className="space-y-2"><Label htmlFor="backup-code">Authenticator code</Label><Input id="backup-code" name="twoFactorCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></div> : null}
        <Button type="submit" disabled={pending}><Upload />{pending ? "Restoring…" : "Restore backup"}</Button>
      </form>
      {message ? <p role="status" className="rounded-md bg-muted p-3 text-sm">{message}</p> : null}
    </section> : null}
  </div>;
}
