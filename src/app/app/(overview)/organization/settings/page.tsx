import { Lock } from "lucide-react";
import Image from "next/image";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { uploadCompanyLogo, updateWorkspaceSettings } from "./actions";

type WorkspaceSettings = {
  theme?: "system" | "light" | "dark";
  backupFrequency?: "daily" | "weekly" | "monthly";
  recoveryDays?: number;
  backupRetentionDays?: number;
  dataRecoveryEnabled?: boolean;
};

export default async function OrganizationSettingsPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    return <EmptyState icon={Lock} title="Access denied" description="Only organization administrators can manage workspace settings." />;
  }
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: tenant.organizationId },
    select: { name: true, metadata: true, logoUrl: true },
  });
  const metadata = organization.metadata;
  const settings = (metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).workspaceSettings
    : {}) as WorkspaceSettings;
  const { saved, error } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader title="Workspace settings" description="Branding, interface defaults, backup policy, and recovery controls for this tenant." />
      {saved ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600">Workspace settings saved.</p> : null}
      {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error === "image" ? "Choose a JPG, PNG, or WebP logo no larger than 1 MB." : "Check the settings and try again."}</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Company logo</CardTitle><CardDescription>Displayed as your tenant branding. Maximum 1 MB.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {organization.logoUrl ? <Image src={organization.logoUrl} alt={`${organization.name} logo`} width={192} height={64} unoptimized className="h-16 max-w-48 object-contain" /> : null}
            <form action={uploadCompanyLogo} className="flex items-end gap-2">
              <Input name="logo" type="file" accept="image/jpeg,image/png,image/webp" required />
              <Button type="submit" variant="outline">Upload</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tenant policy</CardTitle><CardDescription>Configure workspace appearance and the retention policy used for backup and recovery operations.</CardDescription></CardHeader>
          <CardContent>
            <form action={updateWorkspaceSettings} className="space-y-4">
              <div className="space-y-2"><Label>Interface theme</Label>
                <Select name="theme" defaultValue={settings.theme ?? "system"}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="system">Follow device</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Backup frequency</Label>
                <Select name="backupFrequency" defaultValue={settings.backupFrequency ?? "daily"}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="backupRetentionDays">Backup retention (days)</Label><Input id="backupRetentionDays" name="backupRetentionDays" type="number" min={1} max={365} defaultValue={settings.backupRetentionDays ?? 30} required /></div>
                <div className="space-y-2"><Label htmlFor="recoveryDays">Recovery window (days)</Label><Input id="recoveryDays" name="recoveryDays" type="number" min={1} max={365} defaultValue={settings.recoveryDays ?? 30} required /></div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input name="dataRecoveryEnabled" type="checkbox" defaultChecked={settings.dataRecoveryEnabled ?? true} /> Allow recovery requests for retained tenant data</label>
              <p className="text-xs text-muted-foreground">These are tenant policy controls. Physical database snapshots remain encrypted and operated by the platform infrastructure.</p>
              <Button type="submit">Save workspace settings</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
