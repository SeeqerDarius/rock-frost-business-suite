import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCircle2, ImagePlus, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { readPlatformMarketing } from "@/lib/platform-marketing";
import { getCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";
import {
  deleteExternalShowcaseCustomer,
  moveExternalShowcaseCustomer,
  saveExternalShowcaseCustomer,
  updatePlatformSettings,
} from "./actions";
import { ConfirmDeleteButton } from "./confirm-delete-button";

const ERRORS: Record<string, string> = {
  "invalid-settings": "Check the platform and marketing settings, then try again.",
  "invalid-customer": "Enter a customer name, approved quote, and attribution within the shown limits.",
  "customer-not-found": "That showcase customer no longer exists.",
  "invalid-logo": "Choose a JPG, PNG, or WebP logo no larger than 1 MB.",
  "logo-required": "Upload a customer logo before adding the showcase entry.",
};

export default async function PlatformSettingsPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
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
  const marketing = readPlatformMarketing(metadata);
  const { saved, error } = await searchParams;

  return <div className="space-y-6">
    <PageHeader title="Platform settings" description="Control Rock Frost operations, public marketing, and independent customer showcases." />
    {saved ? <Alert><CheckCircle2 /><AlertTitle>Settings updated</AlertTitle><AlertDescription>Your latest platform controls are active.</AlertDescription></Alert> : null}
    {error && ERRORS[error] ? <Alert variant="destructive"><AlertTitle>Could not save</AlertTitle><AlertDescription>{ERRORS[error]}</AlertDescription></Alert> : null}

    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="size-5" />Operations</CardTitle><CardDescription>Defaults governing platform-wide administrative workflows.</CardDescription></CardHeader>
        <CardContent>
          <form id="platform-controls" action={updatePlatformSettings} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="organizationDeletionRecoveryDays">Organization deletion recovery (days)</Label><Input id="organizationDeletionRecoveryDays" name="organizationDeletionRecoveryDays" type="number" min={1} max={365} defaultValue={recoveryDays} required /><p className="text-xs text-muted-foreground">Scheduled tenant deletions remain recoverable for this period.</p></div>
            <div className="border-t pt-4"><p className="font-medium">Public customer showcase</p><p className="text-sm text-muted-foreground">Controls the complete customer-story section on the public home page.</p></div>
            <label className="flex items-center gap-3 rounded-md border p-3 text-sm font-medium"><input name="showcaseEnabled" type="checkbox" defaultChecked={marketing.showcaseEnabled} className="size-4 accent-primary" />Show customer stories on the home page</label>
            <label className="flex items-center gap-3 rounded-md border p-3 text-sm font-medium"><input name="showIndustry" type="checkbox" defaultChecked={marketing.showIndustry} className="size-4 accent-primary" />Show customer industries</label>
            <div className="space-y-2"><Label htmlFor="eyebrow">Section label</Label><Input id="eyebrow" name="eyebrow" maxLength={60} defaultValue={marketing.eyebrow} required /></div>
            <div className="space-y-2"><Label htmlFor="headline">Headline</Label><Input id="headline" name="headline" maxLength={140} defaultValue={marketing.headline} required /></div>
            <div className="space-y-2"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" maxLength={240} rows={3} defaultValue={marketing.description} required /></div>
            <Button type="submit">Save platform controls</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Publishing rules</CardTitle><CardDescription>How public customer proof is protected.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>On-platform tenants still require ACTIVE status, an uploaded logo, complete approved copy, and explicit approval from their organization record.</p>
          <p>Independent customers are managed below and can be published or hidden individually.</p>
          <p>Disabling the showcase section hides every customer story without deleting any saved entry.</p>
          <p>Every create, edit, publish-state change, and removal is written to platform audit activity.</p>
        </CardContent>
      </Card>
    </div>

    <section id="external-customers" className="scroll-mt-24 space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Independent customer showcase</h2>
        <p className="text-muted-foreground">Manage customers whose systems were built by Rock Frost but are hosted outside this platform.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ImagePlus className="size-5" />Add independent customer</CardTitle><CardDescription>Use only logos and testimonial wording the customer has approved for public marketing.</CardDescription></CardHeader>
        <CardContent><CustomerForm /></CardContent>
      </Card>

      <div className="space-y-4">
        {marketing.externalCustomers.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No independent showcase customers have been added yet.</CardContent></Card>
        ) : marketing.externalCustomers.map((customer, index) => (
          <Card key={customer.id}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-slate-950 p-2">
                  <Image src={`/api/public/external-showcase-logo/${customer.id}`} alt={`${customer.name} logo`} width={104} height={56} unoptimized className="max-h-12 max-w-full object-contain" />
                </div>
                <div><CardTitle>{customer.name}</CardTitle><CardDescription>{customer.industry || "Industry not shown"}</CardDescription></div>
              </div>
              <Badge variant={customer.enabled ? "default" : "outline"}>{customer.enabled ? "Published" : "Hidden"}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <CustomerForm customer={customer} />
              <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
                <div className="flex gap-2">
                  <form action={moveExternalShowcaseCustomer}><input type="hidden" name="customerId" value={customer.id} /><input type="hidden" name="direction" value="up" /><Button type="submit" size="sm" variant="outline" disabled={index === 0} aria-label={`Move ${customer.name} up`}><ArrowUp />Move up</Button></form>
                  <form action={moveExternalShowcaseCustomer}><input type="hidden" name="customerId" value={customer.id} /><input type="hidden" name="direction" value="down" /><Button type="submit" size="sm" variant="outline" disabled={index === marketing.externalCustomers.length - 1} aria-label={`Move ${customer.name} down`}><ArrowDown />Move down</Button></form>
                </div>
                <form action={deleteExternalShowcaseCustomer}><input type="hidden" name="customerId" value={customer.id} /><ConfirmDeleteButton name={customer.name} /></form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  </div>;
}

function CustomerForm({ customer }: { customer?: ReturnType<typeof readPlatformMarketing>["externalCustomers"][number] }) {
  const prefix = customer?.id ?? "new-customer";
  return <form action={saveExternalShowcaseCustomer} className="grid gap-4 md:grid-cols-2">
    {customer ? <input type="hidden" name="customerId" value={customer.id} /> : null}
    <div className="space-y-2"><Label htmlFor={`${prefix}-name`}>Customer name</Label><Input id={`${prefix}-name`} name="name" defaultValue={customer?.name ?? ""} maxLength={120} required /></div>
    <div className="space-y-2"><Label htmlFor={`${prefix}-industry`}>Industry</Label><Input id={`${prefix}-industry`} name="industry" defaultValue={customer?.industry ?? ""} maxLength={100} /></div>
    <div className="space-y-2 md:col-span-2"><Label htmlFor={`${prefix}-quote`}>Approved customer quote</Label><Textarea id={`${prefix}-quote`} name="quote" defaultValue={customer?.quote ?? ""} maxLength={320} rows={3} required /></div>
    <div className="space-y-2"><Label htmlFor={`${prefix}-attribution`}>Attribution</Label><Input id={`${prefix}-attribution`} name="attribution" defaultValue={customer?.attribution ?? ""} maxLength={120} placeholder="Name, role, or organization team" required /></div>
    <div className="space-y-2"><Label htmlFor={`${prefix}-logo`}>{customer ? "Replace logo (optional)" : "Customer logo"}</Label><Input id={`${prefix}-logo`} name="logo" type="file" accept="image/jpeg,image/png,image/webp" required={!customer} /><p className="text-xs text-muted-foreground">JPG, PNG, or WebP, up to 1 MB.</p></div>
    <label className="flex items-center gap-3 rounded-md border p-3 text-sm font-medium"><input name="enabled" type="checkbox" defaultChecked={customer?.enabled ?? false} className="size-4 accent-primary" />Publish on home page</label>
    <Button type="submit" className="md:w-fit">{customer ? "Save customer" : "Add customer"}</Button>
  </form>;
}
