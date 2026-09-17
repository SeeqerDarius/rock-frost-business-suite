import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/school/section-card";
import { readPublicShowcase } from "@/lib/public-showcase";
import { updateOrganizationProfile, updateOrganizationPublicShowcase } from "../../actions";
import type { OrganizationDetail } from "./data";
import { Field } from "./shared";

/**
 * The profile form is split into labelled groups rather than one 14-field
 * grid: identity, how to reach them, where they are, and how their numbers
 * and dates are formatted are four different reasons to open this page.
 */
export function ProfileSection({ organization }: { organization: OrganizationDetail }) {
  const publicShowcase = readPublicShowcase(organization.metadata);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Organization profile"
        description="Tenant identity, contact details, location, and the formats every date and amount in their workspace uses."
      >
        <form action={updateOrganizationProfile} className="space-y-6">
          <input type="hidden" name="organizationId" value={organization.id} />

          <FieldGroup legend="Identity">
            <Field label="Organization name" name="name" defaultValue={organization.name} required />
            <Field label="Tenant code" name="tenantCode" defaultValue={organization.tenantCode} required />
            <Field label="Industry" name="industry" defaultValue={organization.industry ?? ""} />
          </FieldGroup>

          <FieldGroup legend="Contact">
            <Field label="Billing email" name="billingEmail" type="email" defaultValue={organization.billingEmail ?? ""} />
            <Field label="Organization email" name="email" type="email" defaultValue={organization.email ?? ""} />
            <Field label="Phone" name="phone" defaultValue={organization.phone ?? ""} />
            <Field label="Website" name="website" defaultValue={organization.website ?? ""} />
          </FieldGroup>

          <FieldGroup legend="Location">
            <Field label="Country" name="country" defaultValue={organization.country ?? ""} />
            <Field label="Region" name="region" defaultValue={organization.region ?? ""} />
            <Field label="City" name="city" defaultValue={organization.city ?? ""} />
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" name="address" defaultValue={organization.address ?? ""} rows={3} />
            </div>
          </FieldGroup>

          <FieldGroup legend="Localization">
            <Field label="Currency" name="currency" defaultValue={organization.currency} required />
            <Field label="Timezone" name="timezone" defaultValue={organization.timezone} required />
            <Field label="Language" name="defaultLanguage" defaultValue={organization.defaultLanguage} required />
          </FieldGroup>

          <Button type="submit">Save profile</Button>
        </form>
      </SectionCard>

      <SectionCard
        title="Public customer showcase"
        description="Publish this customer on the Rock Frost home page only after receiving written permission to use its name, logo, and quote."
      >
        <form action={updateOrganizationPublicShowcase} className="space-y-4">
          <input type="hidden" name="organizationId" value={organization.id} />
          <div className="flex items-center gap-4 rounded-lg border p-4">
            {organization.logoUrl ? (
              <Image
                src={organization.logoUrl}
                alt={`${organization.name} logo`}
                width={96}
                height={48}
                unoptimized
                className="max-h-12 w-24 object-contain"
              />
            ) : (
              <div className="flex h-12 w-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                No logo
              </div>
            )}
            <div>
              <p className="text-sm font-medium">{organization.name}</p>
              <p className="text-xs text-muted-foreground">
                Only ACTIVE organizations with a logo and complete approved copy appear publicly.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote">Approved customer quote</Label>
            <Textarea
              id="quote"
              name="quote"
              defaultValue={publicShowcase.quote}
              maxLength={320}
              rows={4}
              placeholder="How Rock Frost improved the organization's work"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Attribution" name="attribution" defaultValue={publicShowcase.attribution} />
            <label className="flex items-center gap-3 self-end rounded-md border px-4 py-2.5 text-sm font-medium">
              <input name="enabled" type="checkbox" defaultChecked={publicShowcase.enabled} className="size-4 accent-primary" />
              Approved for public showcase
            </label>
          </div>
          <Button type="submit">Save showcase settings</Button>
        </form>
      </SectionCard>
    </div>
  );
}

function FieldGroup({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{legend}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}
