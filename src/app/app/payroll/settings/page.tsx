import { Lock, Percent } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
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
  const tenant = await requireCurrentTenant();

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

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Percent className="size-5 text-muted-foreground" />
            <CardTitle>Default tax rate</CardTitle>
          </div>
          <CardDescription>Applied as a flat deduction against gross pay when a run is processed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveDefaultTaxRate} className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="defaultTaxRatePercent">Tax rate (%)</Label>
              <Input id="defaultTaxRatePercent" name="defaultTaxRatePercent" type="number" step="0.01" defaultValue={currentPercent} className="w-32" />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
