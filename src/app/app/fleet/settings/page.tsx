import { BellRing, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getFleetSettings } from "@/modules/fleet/service";
import { saveFleetSettings } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage Fleet settings.",
  invalid: "The reminder window must be a whole number of days between 1 and 365.",
};

export default async function FleetSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_INSURANCE_MANAGE);

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Fleet Settings" description="Module-wide configuration for Fleet Management." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Fleet settings are limited to roles with insurance/document permissions." />
      </div>
    );
  }

  const settings = await getFleetSettings(tenant.organizationId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Fleet Settings" description="Module-wide configuration for Fleet Management." />

      {saved ? (
        <Alert>
          <AlertTitle>Settings saved</AlertTitle>
          <AlertDescription>New and edited vehicle documents now use this reminder window.</AlertDescription>
        </Alert>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <Alert variant="destructive">
          <AlertTitle>Settings were not saved</AlertTitle>
          <AlertDescription>{ERROR_MESSAGES[error]}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BellRing className="size-5 text-muted-foreground" />
            <CardTitle>Document renewal reminders</CardTitle>
          </div>
          <CardDescription>
            Controls when an insurance or roadworthy document moves from Clear to Expiring soon on the vehicle and in{" "}
            Insurance &amp; Roadworthy, and when the expiring-soon in-app notification fires.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveFleetSettings} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="documentRenewalReminderDays" required>Reminder window (days before expiry)</Label>
              <Input
                id="documentRenewalReminderDays"
                name="documentRenewalReminderDays"
                type="number"
                min={1}
                max={365}
                defaultValue={settings.documentRenewalReminderDays}
                className="w-32"
                required
              />
              <p className="text-xs text-muted-foreground">Every organization starts at 30 days; documents past their expiry date are always Due regardless of this setting.</p>
            </div>
            <Button type="submit" size="sm">Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
