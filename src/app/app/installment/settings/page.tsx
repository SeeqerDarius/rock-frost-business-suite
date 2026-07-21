import { Lock, Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getInstallmentSettings } from "@/modules/installment/service";
import { saveInstallmentSettings } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage Installment settings.",
  "invalid-settings": "Percentages must be between 0 and 100, and money defaults must be zero or positive.",
};

export default async function InstallmentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Installment Settings" description="Module-wide configuration for Installment Management." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Installment settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const settings = await getInstallmentSettings(tenant.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader title="Installment Settings" description="Module-wide configuration for Installment Management." />

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

      <form action={saveInstallmentSettings} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SettingsIcon className="size-5 text-muted-foreground" />
              <CardTitle>Installment configuration</CardTitle>
            </div>
            <CardDescription>Every field here actively drives real business logic — changing them changes behavior.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="installmentDurationDays">Default installment duration (days)</Label>
              <Input id="installmentDurationDays" name="installmentDurationDays" type="number" defaultValue={settings.installmentDurationDays} />
              <p className="text-xs text-muted-foreground">Pre-fills the duration field when creating a new product.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refundDeductionPercent">Refund / reactivation service fee (%)</Label>
              <Input id="refundDeductionPercent" name="refundDeductionPercent" type="number" step="0.01" defaultValue={settings.refundDeductionPercent.toString()} />
              <p className="text-xs text-muted-foreground">Deducted from total paid when an account closes after inactivity, or is reactivated.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentEditWindowHours">Payment edit window (hours)</Label>
              <Input id="paymentEditWindowHours" name="paymentEditWindowHours" type="number" defaultValue={settings.paymentEditWindowHours} />
              <p className="text-xs text-muted-foreground">How long after recording a payment can be edited.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="procurementThresholdPercent">Procurement threshold (%)</Label>
              <Input id="procurementThresholdPercent" name="procurementThresholdPercent" type="number" step="0.01" defaultValue={settings.procurementThresholdPercent.toString()} />
              <p className="text-xs text-muted-foreground">Minimum payment progress before a product shows on the Procurement list.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveryTimeAfterCompletionDays">Archive after delivery (days)</Label>
              <Input id="deliveryTimeAfterCompletionDays" name="deliveryTimeAfterCompletionDays" type="number" defaultValue={settings.deliveryTimeAfterCompletionDays} />
              <p className="text-xs text-muted-foreground">How long after delivery a completed account is archived.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultStaffInventoryQuantity">Default staff inventory quantity</Label>
              <Input id="defaultStaffInventoryQuantity" name="defaultStaffInventoryQuantity" type="number" defaultValue={settings.defaultStaffInventoryQuantity} />
              <p className="text-xs text-muted-foreground">Starting stock assigned when a new staff member or product is created.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultMonthlySalary">Default monthly salary</Label>
              <Input id="defaultMonthlySalary" name="defaultMonthlySalary" type="number" step="0.01" defaultValue={settings.defaultMonthlySalary.toString()} />
              <p className="text-xs text-muted-foreground">Pre-fills the salary field when creating a new staff member.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiptPrefix">Receipt prefix</Label>
              <Input id="receiptPrefix" name="receiptPrefix" defaultValue={settings.receiptPrefix} />
              <p className="text-xs text-muted-foreground">e.g. &quot;RCPT&quot; → RCPT/26/000001.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerIdPrefix">Customer code prefix</Label>
              <Input id="customerIdPrefix" name="customerIdPrefix" defaultValue={settings.customerIdPrefix} />
              <p className="text-xs text-muted-foreground">e.g. &quot;CUST&quot; → CUST/EFU/26/001.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staffCodeLength">Staff code length</Label>
              <Input id="staffCodeLength" name="staffCodeLength" type="number" defaultValue={settings.staffCodeLength} />
              <p className="text-xs text-muted-foreground">Letters taken from a new staff member&apos;s first name, e.g. 3 → &quot;EFU&quot;.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultDailyCollection">Default daily amount</Label>
              <Input id="defaultDailyCollection" name="defaultDailyCollection" type="number" step="0.01" defaultValue={settings.defaultDailyCollection.toString()} />
              <p className="text-xs text-muted-foreground">Pre-fills the daily amount field when creating a new product.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minimumDeposit">Minimum deposit</Label>
              <Input id="minimumDeposit" name="minimumDeposit" type="number" step="0.01" defaultValue={settings.minimumDeposit.toString()} />
              <p className="text-xs text-muted-foreground">If set above zero, opening an account requires an initial deposit at least this much.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="administrationFeePercent">Administration fee (%)</Label>
              <Input id="administrationFeePercent" name="administrationFeePercent" type="number" step="0.01" defaultValue={settings.administrationFeePercent.toString()} />
              <p className="text-xs text-muted-foreground">Added on top of the product price as a one-time origination fee when an account is opened.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="commissionPercentage">Commission (%)</Label>
              <Input id="commissionPercentage" name="commissionPercentage" type="number" step="0.01" defaultValue={settings.commissionPercentage.toString()} />
              <p className="text-xs text-muted-foreground">Share of a staff member&apos;s weekly collections paid as commission, shown in Reports (only if enabled below).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payrollDay">Payroll day of month</Label>
              <Input id="payrollDay" name="payrollDay" type="number" min={1} max={28} defaultValue={settings.payrollDay} />
              <p className="text-xs text-muted-foreground">Shown in Reports as the next payroll due date — there is no automated payroll run.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="commissionEnabled" defaultChecked={settings.commissionEnabled} />
              Commission enabled
            </label>
          </CardContent>
        </Card>

        <Button type="submit">Save settings</Button>
      </form>
    </div>
  );
}
