import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { updatePlatformSettings } from "./actions";

export default async function PlatformSettingsPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) redirect("/app/dashboard");
  const organization = await db.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { metadata: true },
  });
  const metadata = organization?.metadata && typeof organization.metadata === "object" && !Array.isArray(organization.metadata)
    ? organization.metadata as Record<string, unknown>
    : {};
  const configuredDays = Number(metadata.organizationDeletionRecoveryDays);
  const recoveryDays = Number.isInteger(configuredDays) ? configuredDays : 30;
  const { saved, error } = await searchParams;
  return <div className="space-y-6">
    <PageHeader title="Platform settings" description="Operational defaults that apply across the business suite." />
    {saved ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600">Platform settings saved.</p> : null}
    {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Enter a recovery duration between 1 and 365 days.</p> : null}
    <Card className="max-w-xl">
      <CardHeader><CardTitle>Organization deletion recovery</CardTitle><CardDescription>How long a scheduled organization deletion remains recoverable before it is eligible for permanent purge.</CardDescription></CardHeader>
      <CardContent><form action={updatePlatformSettings} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="organizationDeletionRecoveryDays">Recovery duration (days)</Label><Input id="organizationDeletionRecoveryDays" name="organizationDeletionRecoveryDays" type="number" min={1} max={365} defaultValue={recoveryDays} required /></div>
        <Button type="submit">Save setting</Button>
      </form></CardContent>
    </Card>
  </div>;
}
