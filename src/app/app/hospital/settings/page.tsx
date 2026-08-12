import { Settings as SettingsIcon, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalSettings } from "@/modules/hospital/service";
import { upsertHospitalSettingsAction } from "../actions";

export default async function HospitalSettingsPage() {
  const tenant = await requireModuleAccess("hospital");
  if (!hasPermission(tenant, PERMISSIONS.HOSPITAL_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hospital Settings" description="Facility identifiers, numbering, verification, bed, and retention policy." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Hospital settings are limited to roles with settings-management permissions." />
      </div>
    );
  }

  const facilities = await listHospitalSettings(tenant.organizationId);
  if (facilities.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hospital Settings" description="Facility identifiers, numbering, verification, bed, and retention policy." />
        <EmptyState icon={SettingsIcon} title="No facility configured yet" description="Add a facility under Facility before configuring its settings." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Hospital Settings" description="Facility identifiers, numbering, clinical-result verification, bed rules, and retention policy." />
      <p className="rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        Retention and configuration here support operational record-keeping only. Your organization is responsible for
        aligning retention periods, consent practice, and local configuration with Ghana Health Service/HeFRA, the
        Data Protection Commission, NHIA, and any other applicable professional or regulatory requirements.
      </p>
      {facilities.map((facility) => {
        const s = facility.settings;
        return (
          <Card key={facility.id}>
            <CardHeader><CardTitle>{facility.name}</CardTitle><CardDescription>Numbering prefixes, currency, and policy for this facility.</CardDescription></CardHeader>
            <CardContent>
              <form action={upsertHospitalSettingsAction} className="space-y-4">
                <input type="hidden" name="facilityId" value={facility.id} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div><Label htmlFor={`timezone-${facility.id}`}>Timezone</Label><Input id={`timezone-${facility.id}`} name="timezone" defaultValue={facility.timezone} required /></div>
                  <div><Label htmlFor={`currency-${facility.id}`}>Currency</Label><Input id={`currency-${facility.id}`} name="currency" defaultValue={facility.currency} maxLength={3} required /></div>
                  <div><Label htmlFor={`retentionYears-${facility.id}`}>Retention (years)</Label><Input id={`retentionYears-${facility.id}`} name="retentionYears" type="number" defaultValue={s?.retentionYears ?? 7} required /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div><Label htmlFor={`mrnPrefix-${facility.id}`}>MRN prefix</Label><Input id={`mrnPrefix-${facility.id}`} name="mrnPrefix" defaultValue={s?.mrnPrefix ?? "MRN"} required /></div>
                  <div><Label htmlFor={`encounterPrefix-${facility.id}`}>Encounter prefix</Label><Input id={`encounterPrefix-${facility.id}`} name="encounterPrefix" defaultValue={s?.encounterPrefix ?? "ENC"} required /></div>
                  <div><Label htmlFor={`appointmentPrefix-${facility.id}`}>Appointment prefix</Label><Input id={`appointmentPrefix-${facility.id}`} name="appointmentPrefix" defaultValue={s?.appointmentPrefix ?? "APT"} required /></div>
                  <div><Label htmlFor={`admissionPrefix-${facility.id}`}>Admission prefix</Label><Input id={`admissionPrefix-${facility.id}`} name="admissionPrefix" defaultValue={s?.admissionPrefix ?? "ADM"} required /></div>
                  <div><Label htmlFor={`invoicePrefix-${facility.id}`}>Invoice prefix</Label><Input id={`invoicePrefix-${facility.id}`} name="invoicePrefix" defaultValue={s?.invoicePrefix ?? "INV"} required /></div>
                  <div><Label htmlFor={`receiptPrefix-${facility.id}`}>Receipt prefix</Label><Input id={`receiptPrefix-${facility.id}`} name="receiptPrefix" defaultValue={s?.receiptPrefix ?? "RCT"} required /></div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="resultVerificationRequired" className="size-4" defaultChecked={s?.resultVerificationRequired ?? true} />Require explicit verification before a lab/imaging result is final</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="bedTransferRequiresReason" className="size-4" defaultChecked={s?.bedTransferRequiresReason ?? true} />Encourage a reason on every bed transfer</label>
                </div>
                <Button type="submit">Save settings</Button>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
