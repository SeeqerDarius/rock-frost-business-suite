import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getPharmacySettings } from "@/modules/pharmacy/service";
import { saveSettings } from "../actions";
import { PharmacyStatusBanner } from "../status-banner";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const t = await requireModuleAccess("pharmacy");
  const s = await getPharmacySettings(t.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader title="Pharmacy Settings" description="Licence metadata, pharmacist responsibility, numbering and medicine-safety controls." />

      <PharmacyStatusBanner saved={saved} error={error} />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Operational controls</CardTitle>
          <CardDescription>Licence metadata, numbering, and medicine-safety toggles for this pharmacy.</CardDescription>
        </CardHeader>
        <form action={saveSettings}>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-licenceNumber">Pharmacy licence number</Label>
                <Input id="settings-licenceNumber" name="licenceNumber" defaultValue={s.licenceNumber ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-superintendentPharmacist">Superintendent pharmacist</Label>
                <Input id="settings-superintendentPharmacist" name="superintendentPharmacist" defaultValue={s.superintendentPharmacist ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-superintendentRegistration">Registration number</Label>
                <Input id="settings-superintendentRegistration" name="superintendentRegistration" defaultValue={s.superintendentRegistration ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-receiptPrefix" required>Receipt prefix</Label>
                <Input id="settings-receiptPrefix" name="receiptPrefix" defaultValue={s.receiptPrefix} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-prescriptionValidityDays" required>Prescription validity days</Label>
                <Input id="settings-prescriptionValidityDays" name="prescriptionValidityDays" type="number" min="1" defaultValue={s.prescriptionValidityDays} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-expiryAlertDays" required>Expiry alert days</Label>
                <Input id="settings-expiryAlertDays" name="expiryAlertDays" type="number" min="1" defaultValue={s.expiryAlertDays} required />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <SettingsToggleRow
                id="settings-requirePatientForControlled"
                name="requirePatientForControlled"
                label="Require patient for controlled medicines"
                defaultChecked={s.requirePatientForControlled}
              />
              <SettingsToggleRow
                id="settings-controlledDispenseMakerCheckerEnabled"
                name="controlledDispenseMakerCheckerEnabled"
                label="Require a second person to approve controlled-drug dispensing"
                defaultChecked={s.controlledDispenseMakerCheckerEnabled}
              />
              <SettingsToggleRow
                id="settings-allowNegativeStock"
                name="allowNegativeStock"
                label="Allow negative stock"
                description="Lets adjustments, write-offs, and returns take a batch below zero."
                defaultChecked={s.allowNegativeStock}
              />
              <SettingsToggleRow
                id="settings-smsNotificationsEnabled"
                name="smsNotificationsEnabled"
                label="Text patients when their order is ready for pickup"
                defaultChecked={s.smsNotificationsEnabled}
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit">Save settings</Button>
          </CardFooter>
        </form>
      </Card>
      <p className="text-sm text-muted-foreground">These settings support operations but do not validate licences or certify regulatory compliance.</p>
    </div>
  );
}
