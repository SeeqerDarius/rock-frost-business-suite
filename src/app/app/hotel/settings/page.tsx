import Link from "next/link";
import { Building2, CheckCircle2, Info, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHotelSettings } from "@/modules/hotel/service";
import { upsertHotelSettingsAction } from "../actions";

export default async function HotelSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("hotel"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.HOTEL_SETTINGS_MANAGE);
  const properties = await listHotelSettings(tenant.organizationId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Hotel Settings" description="Property identity, stay policies, charges, numbering, settlement, and housekeeping controls." />
      {query.saved ? <Alert><CheckCircle2 /><AlertTitle>Settings saved</AlertTitle><AlertDescription>The property configuration is now active for new hotel workflows.</AlertDescription></Alert> : null}
      {query.error ? <Alert variant="destructive"><Info /><AlertTitle>Settings were not saved</AlertTitle><AlertDescription>Review every value and try again. Prefixes use 2–8 uppercase letters or numbers.</AlertDescription></Alert> : null}
      {!canManage ? <Alert><LockKeyhole /><AlertTitle>Read-only access</AlertTitle><AlertDescription>Your role can review this configuration but cannot change it.</AlertDescription></Alert> : null}

      {properties.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Create a property first"
          description="Hotel policies are stored per property so multi-property organizations can operate independently."
          action={canManage ? <Button nativeButton={false} render={<Link href="/app/hotel/properties" />}>Go to properties</Button> : undefined}
        />
      ) : properties.map((property) => {
        const settings = property.settings;
        return (
          <Card key={property.id} className="shadow-sm">
            <CardHeader className="border-b">
              <CardTitle>{property.name}</CardTitle>
              <CardDescription>{property.code} · Settings apply only to this property.</CardDescription>
            </CardHeader>
            <form action={upsertHotelSettingsAction}>
              <input type="hidden" name="propertyId" value={property.id} />
              <CardContent className="grid gap-6 pt-2 lg:grid-cols-2">
                <section className="space-y-4">
                  <div><h2 className="text-sm font-semibold">Property and stay policy</h2><p className="text-xs text-muted-foreground">Local time, operating currency, and standard arrival/departure controls.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor={`${property.id}-timezone`} required>Timezone</Label><Input id={`${property.id}-timezone`} name="timezone" defaultValue={property.timezone} placeholder="Africa/Accra" disabled={!canManage} required /></div>
                    <div className="space-y-1.5"><Label htmlFor={`${property.id}-currency`} required>Currency</Label><Input id={`${property.id}-currency`} name="currency" defaultValue={property.currency} maxLength={3} className="uppercase" disabled={!canManage} required /></div>
                    <div className="space-y-1.5"><Label htmlFor={`${property.id}-check-in`} required>Standard check-in</Label><Input id={`${property.id}-check-in`} name="checkInTime" type="time" defaultValue={settings?.checkInTime ?? "14:00"} disabled={!canManage} required /></div>
                    <div className="space-y-1.5"><Label htmlFor={`${property.id}-check-out`} required>Standard check-out</Label><Input id={`${property.id}-check-out`} name="checkOutTime" type="time" defaultValue={settings?.checkOutTime ?? "11:00"} disabled={!canManage} required /></div>
                  </div>
                  <SettingsToggleRow
                    id={`${property.id}-allowOutstandingCheckout`}
                    name="allowOutstandingCheckout"
                    label="Allow checkout with an outstanding balance"
                    description="Permits a folio to close before the remaining balance is fully settled."
                    defaultChecked={settings?.allowOutstandingCheckout}
                    disabled={!canManage}
                  />
                  <SettingsToggleRow
                    id={`${property.id}-smsNotificationsEnabled`}
                    name="smsNotificationsEnabled"
                    label="Text guests when a reservation is confirmed"
                    description="Sends a confirmation SMS to the guest's phone number on file, if one exists."
                    defaultChecked={settings?.smsNotificationsEnabled}
                    disabled={!canManage}
                  />
                </section>

                <section className="space-y-4">
                  <div><h2 className="text-sm font-semibold">Charges and settlement</h2><p className="text-xs text-muted-foreground">Default percentages applied by property-level billing policy.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor={`${property.id}-tax`} required>Tax rate (%)</Label><Input id={`${property.id}-tax`} name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue={settings?.taxRate.toString() ?? "0"} disabled={!canManage} required /></div>
                    <div className="space-y-1.5"><Label htmlFor={`${property.id}-service`} required>Service charge (%)</Label><Input id={`${property.id}-service`} name="serviceChargeRate" type="number" min="0" max="100" step="0.01" defaultValue={settings?.serviceChargeRate.toString() ?? "0"} disabled={!canManage} required /></div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div><h2 className="text-sm font-semibold">Document numbering</h2><p className="text-xs text-muted-foreground">Short prefixes used for new reservations, folios, receipts, and restaurant orders.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      ["reservationPrefix", "Reservation prefix", settings?.reservationPrefix ?? "RSV"],
                      ["folioPrefix", "Folio prefix", settings?.folioPrefix ?? "FOL"],
                      ["receiptPrefix", "Receipt prefix", settings?.receiptPrefix ?? "HRC"],
                      ["orderPrefix", "Order prefix", settings?.orderPrefix ?? "ORD"],
                    ].map(([name, label, value]) => <div key={name} className="space-y-1.5"><Label htmlFor={`${property.id}-${name}`} required>{label}</Label><Input id={`${property.id}-${name}`} name={name} defaultValue={value} minLength={2} maxLength={8} className="uppercase" disabled={!canManage} required /></div>)}
                  </div>
                </section>

                <section className="space-y-4">
                  <div><h2 className="text-sm font-semibold">Housekeeping workflow</h2><p className="text-xs text-muted-foreground">Controls created after checkout and before a room returns to inventory.</p></div>
                  <div className="space-y-1.5"><Label htmlFor={`${property.id}-due-hours`} required>Checkout task due within (hours)</Label><Input id={`${property.id}-due-hours`} name="housekeepingDueHours" type="number" min="1" max="168" defaultValue={settings?.housekeepingDueHours ?? 4} disabled={!canManage} required /></div>
                  <SettingsToggleRow
                    id={`${property.id}-autoCreateCheckoutTask`}
                    name="autoCreateCheckoutTask"
                    label="Automatically create a checkout cleaning task"
                    description="Creates a priority housekeeping task whenever a guest checks out."
                    defaultChecked={settings?.autoCreateCheckoutTask ?? true}
                    disabled={!canManage}
                  />
                  <SettingsToggleRow
                    id={`${property.id}-requireHousekeepingInspection`}
                    name="requireHousekeepingInspection"
                    label="Require inspection before completion"
                    description="A cleaning task must enter Inspection before it can mark the room Available."
                    defaultChecked={settings?.requireHousekeepingInspection}
                    disabled={!canManage}
                  />
                </section>
              </CardContent>
              {canManage ? <CardFooter className="justify-end"><Button type="submit">Save {property.name}</Button></CardFooter> : null}
            </form>
          </Card>
        );
      })}
    </div>
  );
}
