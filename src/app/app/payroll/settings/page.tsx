import { Lock, Percent } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsBanner } from "@/components/settings/settings-banner";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSettings } from "@/modules/payroll/service";
import { saveDefaultTaxRate } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage Payroll settings.",
  "missing-fields": "A tax rate is required.",
  "invalid-rate": "Tax rate must be between 0% and 100%.",
};

export default async function PayrollSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("payroll");

  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payroll Settings" description="Module-wide configuration for Payroll." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Payroll settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const settings = await getSettings(tenant.organizationId);
  const currentPercent = (Number(settings.defaultTaxRate) * 100).toFixed(2);

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll Settings" description="Module-wide configuration for Payroll." />

      <SettingsBanner saved={saved} error={error} errorMessages={ERROR_MESSAGES} />

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Percent className="size-5 text-muted-foreground" />
            <CardTitle>Default tax rate</CardTitle>
          </div>
          <CardDescription>Applied as a flat deduction against gross pay when a run is processed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={saveDefaultTaxRate} className="space-y-4">
            <div className="max-w-32 space-y-2">
              <Label htmlFor="defaultTaxRatePercent">Tax rate (%)</Label>
              <Input id="defaultTaxRatePercent" name="defaultTaxRatePercent" type="number" step="0.01" defaultValue={currentPercent} />
            </div>
            <SettingsToggleRow
              id="smsNotificationsEnabled"
              name="smsNotificationsEnabled"
              label="Text employees when their payslip is issued"
              defaultChecked={settings.smsNotificationsEnabled}
            />
            <Button type="submit" size="sm" variant="outline">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
