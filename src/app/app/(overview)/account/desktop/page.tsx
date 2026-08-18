import { Laptop, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { OFFLINE_SUPPORTED_MODULES } from "@/lib/offline-sync/contract";
import { getModule } from "@/platform/modules/registry";
import { ActivationCodeForm } from "./activation-code-form";
import { revokeDesktopDevice } from "./actions";

export default async function DesktopDevicesPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  const modules = OFFLINE_SUPPORTED_MODULES
    .filter((key) => tenant.accessibleModuleKeys.includes(key))
    .map((key) => ({ key, label: getModule(key)?.name ?? key }));
  const devices = await db.offlineDevice.findMany({
    where: { organizationId: tenant.organizationId, userId: tenant.userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Desktop and offline access" description="Activate, review, and revoke desktop installations that can work during temporary internet outages." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Activate a desktop</CardTitle><CardDescription>Codes are single-use and expire after 10 minutes.</CardDescription></CardHeader>
          <CardContent>
            {modules.length > 0 ? <ActivationCodeForm modules={modules} /> : <p className="text-sm text-muted-foreground">Your account has no module currently approved for offline access.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" />Offline safety boundary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Offline access expires after 72 hours without a successful cloud connection. Every reconnect rechecks your account, role, subscription, module access, and device status.</p>
            <p>Fleet, Installment, and Inventory keep sensitive actions such as approvals, refunds, payroll finalization, HR termination, accounting posting, prescriptions, and clinical decisions online-only.</p>
            <p>Point of Sale and School are full offline exceptions, including refunds, register and settings edits, and School&apos;s fee, exam, and payroll-adjustment actions. Every one of them is re-validated against your account and role the moment the device reconnects.</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Activated devices</CardTitle><CardDescription>Revocation takes effect on the next connection. The desktop client must lock and remove protected cached data.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {devices.length === 0 ? <p className="text-sm text-muted-foreground">No desktop installations have been activated.</p> : devices.map((device) => (
            <div key={device.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3"><Laptop className="mt-0.5 size-5 text-muted-foreground" /><div><p className="font-medium">{device.name}</p><p className="text-sm text-muted-foreground">{device.platform}, {device.moduleKeys.join(", ")}, {device.status.toLowerCase()}</p><p className="text-xs text-muted-foreground">Last sync: {device.lastSyncAt?.toLocaleString() ?? "Never"}</p></div></div>
              {device.status === "ACTIVE" ? <form action={revokeDesktopDevice}><input type="hidden" name="deviceId" value={device.id} /><Button type="submit" variant="destructive">Revoke device</Button></form> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
