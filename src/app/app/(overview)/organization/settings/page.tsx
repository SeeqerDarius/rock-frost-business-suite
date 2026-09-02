import { CheckCircle2, CloudOff, CreditCard, DatabaseBackup, ImageIcon, Lock, Palette, Receipt, TriangleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { updateOfflineAccessSettings, uploadCompanyLogo, updateWorkspaceSettings } from "./actions";
import { getSettlementProfile, settlementStatusLabel } from "@/lib/payments/operational";
import { OFFLINE_SUPPORTED_MODULES } from "@/lib/pwa/policy";

const ERROR_MESSAGES: Record<string, string> = {
  image: "Choose a JPG, PNG, or WebP logo no larger than 1 MB.",
  invalid: "Check the settings and try again.",
  offline: "Check the offline access policy and try again.",
};

type WorkspaceSettings = {
  theme?: "system" | "light" | "dark";
  backupFrequency?: "daily" | "weekly" | "monthly";
  recoveryDays?: number;
  backupRetentionDays?: number;
  dataRecoveryEnabled?: boolean;
};

type OfflineSettings = { enabled?: boolean; mutationKillSwitch?: boolean; moduleKeys?: string[]; leaseHours?: number };

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
  const offlineSettings = (metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).offlineAccess
    : {}) as OfflineSettings;
  const { saved, error } = await searchParams;
  const settlement = await getSettlementProfile(tenant.organizationId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Workspace settings" description="Branding, interface defaults, backup policy, and recovery controls for this tenant." />

      {saved === "logo" ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Logo updated</AlertTitle>
          <AlertDescription>Your logo now appears in place of the Rock Frost mark throughout this workspace&apos;s sidebar.</AlertDescription>
        </Alert>
      ) : saved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Workspace settings saved</AlertTitle>
          <AlertDescription>The updated theme and backup policy apply immediately.</AlertDescription>
        </Alert>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Settings were not saved</AlertTitle>
          <AlertDescription>{ERROR_MESSAGES[error]}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader><div className="flex items-center gap-2"><CreditCard className="size-5 text-muted-foreground" /><CardTitle>Payments and online collections</CardTitle></div><CardDescription>Connect the organization bank account that should receive operational payments. Rock Frost uses its secure Paystack integration to route collections. Your Paystack credentials are never required.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {settlement ? (
            <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
              <div><p className="text-muted-foreground">Bank</p><p className="font-medium">{settlement.settlementBankName}</p></div>
              <div><p className="text-muted-foreground">Account</p><p className="font-medium">&bull;&bull;&bull;&bull; {settlement.accountLast4}</p></div>
              <div><p className="text-muted-foreground">Status</p><p className="font-medium">{settlementStatusLabel(settlement.status)}</p></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No settlement account has been started yet.</p>
          )}
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/organization/payments" />}><Receipt />{settlement ? "Manage settlement and view receipts" : "Set up online collections"}</Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon className="size-5 text-muted-foreground" />
            <CardTitle>Company logo</CardTitle>
          </div>
          <CardDescription>
            Replaces the Rock Frost mark in this workspace&apos;s sidebar for everyone in your organization. JPG, PNG, or
            WebP, up to 1 MB. A square or wide logo with a transparent background works best.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
              {organization.logoUrl ? (
                <Image src={organization.logoUrl} alt={`${organization.name} logo`} width={56} height={56} unoptimized className="max-h-14 max-w-14 object-contain" />
              ) : (
                <ImageIcon className="size-6 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {organization.logoUrl ? "Currently shown in your sidebar." : "No logo uploaded yet. The Rock Frost mark is shown by default."}
            </p>
          </div>
          <form action={uploadCompanyLogo} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="logo">{organization.logoUrl ? "Replace logo" : "Upload logo"}</Label>
              <Input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" required className="max-w-xs" />
            </div>
            <Button type="submit" variant="outline">Upload</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2"><CloudOff className="size-5 text-muted-foreground" /><CardTitle>Offline access rollout</CardTitle></div>
          <CardDescription>Authorize short-lived offline workspace access by module. Turning off new offline mutations does not discard work that is already waiting to synchronize.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateOfflineAccessSettings} className="space-y-4">
            <SettingsToggleRow id="offlineEnabled" name="offlineEnabled" label="Allow registered browser devices to download authorized offline data" defaultChecked={offlineSettings.enabled ?? false} />
            <SettingsToggleRow id="offlineMutationEnabled" name="offlineMutationEnabled" label="Allow new offline mutations" description="Turn this off as a kill switch. Previously queued work can still synchronize." defaultChecked={offlineSettings.mutationKillSwitch === false} />
            <div className="max-w-xs space-y-2"><Label htmlFor="offlineLeaseHours" required>Offline authorization lease (hours)</Label><Input id="offlineLeaseHours" name="offlineLeaseHours" type="number" min={1} max={24} defaultValue={offlineSettings.leaseHours ?? 12} required /></div>
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Modules available offline</legend><div className="grid gap-2 sm:grid-cols-2">{tenant.accessibleModuleKeys.filter((key) => (OFFLINE_SUPPORTED_MODULES as readonly string[]).includes(key)).map((key) => <label key={key} className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" name="offlineModule" value={key} defaultChecked={offlineSettings.moduleKeys?.includes(key) ?? false} />{key}</label>)}</div></fieldset>
            <Alert><TriangleAlert /><AlertTitle>Server confirmation remains authoritative</AlertTitle><AlertDescription>Payments, stock, approvals, clinical work, reconciliation, and posting remain pending until the server accepts them.</AlertDescription></Alert>
            <Button type="submit" size="sm">Save offline policy</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="size-5 text-muted-foreground" />
            <CardTitle>Interface theme</CardTitle>
          </div>
          <CardDescription>Applies to every member&apos;s session in this workspace the next time they load the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateWorkspaceSettings} className="space-y-4">
            <input type="hidden" name="backupFrequency" value={settings.backupFrequency ?? "daily"} />
            <input type="hidden" name="backupRetentionDays" value={settings.backupRetentionDays ?? 30} />
            <input type="hidden" name="recoveryDays" value={settings.recoveryDays ?? 30} />
            {settings.dataRecoveryEnabled ?? true ? <input type="hidden" name="dataRecoveryEnabled" value="on" /> : null}
            <div className="max-w-xs space-y-2">
              <Label>Theme</Label>
              <Select name="theme" defaultValue={settings.theme ?? "system"} items={{ system: "Follow device", light: "Light", dark: "Dark" }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">Follow device</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm">Save theme</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Backup and recovery policy</CardTitle>
          <CardDescription>Record your preferred retention and recovery policy. Downloadable module backups and protected merge restores are available from the backup workspace; physical database recovery remains a platform-operator procedure.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateWorkspaceSettings} className="space-y-4">
            <input type="hidden" name="theme" value={settings.theme ?? "system"} />
            <div className="max-w-xs space-y-2">
              <Label>Backup frequency</Label>
              <Select name="backupFrequency" defaultValue={settings.backupFrequency ?? "daily"} items={{ daily: "Daily", weekly: "Weekly", monthly: "Monthly" }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="backupRetentionDays" required>Backup retention (days)</Label>
                <Input id="backupRetentionDays" name="backupRetentionDays" type="number" min={1} max={365} defaultValue={settings.backupRetentionDays ?? 30} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recoveryDays" required>Recovery window (days)</Label>
                <Input id="recoveryDays" name="recoveryDays" type="number" min={1} max={365} defaultValue={settings.recoveryDays ?? 30} required />
              </div>
            </div>
            <SettingsToggleRow
              id="dataRecoveryEnabled"
              name="dataRecoveryEnabled"
              label="Allow recovery requests for retained tenant data"
              defaultChecked={settings.dataRecoveryEnabled ?? true}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" variant="outline">Save policy</Button>
              <Button nativeButton={false} render={<Link href="/app/organization/backups" />}><DatabaseBackup />Open backup workspace</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
