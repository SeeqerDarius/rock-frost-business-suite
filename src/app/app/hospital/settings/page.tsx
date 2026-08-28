import { Settings as SettingsIcon, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsBanner } from "@/components/settings/settings-banner";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalSettings } from "@/modules/hospital/service";
import { upsertHospitalSettingsAction } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage Hospital settings.",
  invalid: "Check the highlighted fields - prefixes must be 2-8 letters or numbers, currency must be a 3-letter code, and retention must be a whole number of years.",
};

export default async function HospitalSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
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

      <SettingsBanner saved={saved} error={error} errorMessages={ERROR_MESSAGES} />

      {facilities.map((facility) => {
        const s = facility.settings;
        return (
          <Card key={facility.id} className="shadow-sm">
            <CardHeader><CardTitle>{facility.name}</CardTitle><CardDescription>Numbering prefixes, currency, and policy for this facility.</CardDescription></CardHeader>
            <form action={upsertHospitalSettingsAction}>
              <CardContent className="space-y-6">
                <input type="hidden" name="facilityId" value={facility.id} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor={`timezone-${facility.id}`} required>Timezone</Label><Input id={`timezone-${facility.id}`} name="timezone" defaultValue={facility.timezone} required /></div>
                  <div className="space-y-2"><Label htmlFor={`currency-${facility.id}`} required>Currency</Label><Input id={`currency-${facility.id}`} name="currency" defaultValue={facility.currency} maxLength={3} required /></div>
                  <div className="space-y-2"><Label htmlFor={`retentionYears-${facility.id}`} required>Retention (years)</Label><Input id={`retentionYears-${facility.id}`} name="retentionYears" type="number" defaultValue={s?.retentionYears ?? 7} required /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor={`mrnPrefix-${facility.id}`} required>MRN prefix</Label><Input id={`mrnPrefix-${facility.id}`} name="mrnPrefix" defaultValue={s?.mrnPrefix ?? "MRN"} required /></div>
                  <div className="space-y-2"><Label htmlFor={`encounterPrefix-${facility.id}`} required>Encounter prefix</Label><Input id={`encounterPrefix-${facility.id}`} name="encounterPrefix" defaultValue={s?.encounterPrefix ?? "ENC"} required /></div>
                  <div className="space-y-2"><Label htmlFor={`appointmentPrefix-${facility.id}`} required>Appointment prefix</Label><Input id={`appointmentPrefix-${facility.id}`} name="appointmentPrefix" defaultValue={s?.appointmentPrefix ?? "APT"} required /></div>
                  <div className="space-y-2"><Label htmlFor={`admissionPrefix-${facility.id}`} required>Admission prefix</Label><Input id={`admissionPrefix-${facility.id}`} name="admissionPrefix" defaultValue={s?.admissionPrefix ?? "ADM"} required /></div>
                  <div className="space-y-2"><Label htmlFor={`invoicePrefix-${facility.id}`} required>Invoice prefix</Label><Input id={`invoicePrefix-${facility.id}`} name="invoicePrefix" defaultValue={s?.invoicePrefix ?? "INV"} required /></div>
                  <div className="space-y-2"><Label htmlFor={`receiptPrefix-${facility.id}`} required>Receipt prefix</Label><Input id={`receiptPrefix-${facility.id}`} name="receiptPrefix" defaultValue={s?.receiptPrefix ?? "RCT"} required /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SettingsToggleRow
                    id={`resultVerificationRequired-${facility.id}`}
                    name="resultVerificationRequired"
                    label="Require explicit result verification"
                    description="A lab/imaging result must be explicitly verified before it's final."
                    defaultChecked={s?.resultVerificationRequired ?? true}
                  />
                  <SettingsToggleRow
                    id={`labImagingMakerCheckerEnforced-${facility.id}`}
                    name="labImagingMakerCheckerEnforced"
                    label="Enforce maker-checker on results"
                    description="Blocks the person who entered a lab/imaging result from also verifying it."
                    defaultChecked={s?.labImagingMakerCheckerEnforced ?? true}
                  />
                  <SettingsToggleRow
                    id={`bedTransferRequiresReason-${facility.id}`}
                    name="bedTransferRequiresReason"
                    label="Encourage a reason on bed transfers"
                    defaultChecked={s?.bedTransferRequiresReason ?? true}
                  />
                  <SettingsToggleRow
                    id={`smsNotificationsEnabled-${facility.id}`}
                    name="smsNotificationsEnabled"
                    label="Text patients an appointment reminder"
                    description="Sent the day before a scheduled appointment."
                    defaultChecked={s?.smsNotificationsEnabled ?? false}
                  />
                </div>
              </CardContent>
              <CardFooter className="justify-end">
                <Button type="submit">Save settings</Button>
              </CardFooter>
            </form>
          </Card>
        );
      })}
    </div>
  );
}
