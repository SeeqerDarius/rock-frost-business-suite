import Link from "next/link";
import { connection } from "next/server";
import { unstable_cache } from "next/cache";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { catalogueModuleRegistry } from "@/platform/modules/registry";
import { JsonLd } from "@/components/seo/json-ld";
import { createPublicMetadata, DEFAULT_DESCRIPTION, SITE_URL } from "@/lib/seo";
import { db } from "@/lib/db";
import { PUBLIC_SHOWCASE_FILTER, readPublicShowcase } from "@/lib/public-showcase";
import { CustomerShowcase } from "@/components/marketing/customer-showcase";
import { findPlatformOrganizationMetadata, readPlatformMarketing, PUBLIC_MARKETING_CACHE_TAG } from "@/lib/platform-marketing";
import { PublicHero } from "@/components/marketing/public-hero";
import { HomepageWorkspacePreview } from "@/components/marketing/homepage-workspace-preview";
import { ModuleBlocksIllustration } from "@/components/marketing/module-blocks-illustration";
import { AccountingModuleShowcase } from "@/components/marketing/module-showcases/accounting";
import { FleetModuleShowcase } from "@/components/marketing/module-showcases/fleet";
import { PharmacyModuleShowcase } from "@/components/marketing/module-showcases/pharmacy";
import { WhyRockFrost } from "@/components/marketing/why-rock-frost";
import { HomepageFaq } from "@/components/marketing/homepage-faq";
import { listPublishedTestimonials } from "@/lib/customer-feedback";

const FEATURED_MODULE_KEYS = new Set(["accounting", "fleet", "inventory", "hr", "pharmacy", "school"]);

/** Tenant-side showcase opt-ins change rarely: cached for 5 minutes (Next's
 * Data Cache) rather than re-queried on every homepage view and crawl. See
 * PUBLIC_MARKETING_CACHE_TAG for what invalidates it. */
const readShowcaseOrganizations = unstable_cache(
  async () => db.organization.findMany({
    where: PUBLIC_SHOWCASE_FILTER,
    select: { id: true, name: true, industry: true, metadata: true },
    orderBy: { name: "asc" },
    take: 12,
  }),
  ["public-homepage-showcase-organizations"],
  { revalidate: 300, tags: [PUBLIC_MARKETING_CACHE_TAG] },
);

export const metadata = createPublicMetadata({
  title: "Business Management Software Ghana",
  description: DEFAULT_DESCRIPTION,
  path: "/",
  keywords: ["business management software Ghana", "ERP software Ghana", "business software Africa", "modular SaaS platform"],
});

export default async function HomePage() {
  // Public customer stories are database-backed and owner-controlled. Tie
  // rendering to the incoming request so builds never require database access.
  await connection();
  const [showcaseOrganizations, platformOrganization, publishedTestimonials] = await Promise.all([
    readShowcaseOrganizations(),
    findPlatformOrganizationMetadata(),
    listPublishedTestimonials(),
  ]);
  const marketing = readPlatformMarketing(platformOrganization?.metadata);
  const featuredModules = catalogueModuleRegistry.filter((module_) => FEATURED_MODULE_KEYS.has(module_.key));
  const tenantCustomers = showcaseOrganizations.flatMap((organization) => {
    const showcase = readPublicShowcase(organization.metadata);
    if (!showcase.quote || !showcase.attribution) return [];
    return [{
      id: organization.id,
      name: organization.name,
      industry: marketing.showIndustry ? organization.industry : null,
      logoUrl: `/api/public/showcase-logo/${organization.id}`,
      quote: showcase.quote,
      attribution: showcase.attribution,
    }];
  });
  const externalCustomers = marketing.externalCustomers
    .filter((customer) => customer.enabled)
    .map((customer) => ({
      id: `external-${customer.id}`,
      name: customer.name,
      industry: marketing.showIndustry ? customer.industry || null : null,
      logoUrl: `/api/public/external-showcase-logo/${customer.id}`,
      quote: customer.quote,
      attribution: customer.attribution,
    }));
  const testimonialCustomers = publishedTestimonials.map((testimonial) => ({
    id: `feedback-${testimonial.id}`,
    name: testimonial.displayOrganization ? testimonial.organizationNameSnapshot : "Rock Frost customer",
    industry: testimonial.displayOrganization ? testimonial.organization.industry : null,
    logoUrl: testimonial.displayLogo ? testimonial.organization.logoUrl || "" : "",
    quote: testimonial.publishedMessage || testimonial.message,
    attribution: testimonial.displayPerson
      ? `${testimonial.submitterNameSnapshot}${testimonial.jobTitleSnapshot ? `, ${testimonial.jobTitleSnapshot}` : ""}`
      : "Verified customer",
    rating: testimonial.rating,
  }));
  const managedCustomers = marketing.showcaseEnabled ? [...externalCustomers, ...tenantCustomers] : [];
  const customers = [...testimonialCustomers, ...managedCustomers].slice(0, 12);

  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Rock Frost Business Suite",
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: DEFAULT_DESCRIPTION,
        provider: { "@id": `${SITE_URL}/#organization` },
      }} />
      <PublicHero eyebrow="Business management software built for Ghana" title="Run the work. See the money. Stay in control." description="Bring accounting, fleet, people, stock and industry operations into one role-based workspace. Start with the systems your team needs, then connect more as you grow." actions={<>
            <Button size="lg" nativeButton={false} render={<Link href="/subscribe" />}>Start your subscription</Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/pricing" />}>See pricing</Button>
          </>}>
        <div className="relative">
          <ModuleBlocksIllustration className="pointer-events-none absolute -right-3 -top-5 z-0 h-auto w-24 opacity-60" />
          <div className="relative z-10">
            <HomepageWorkspacePreview />
          </div>
        </div>
      </PublicHero>
      <section className="public-section-tint">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-2xl space-y-2">
              <p className="public-eyebrow">A connected business platform</p>
              <h2 className="text-2xl font-semibold tracking-tight">Start with the systems your team needs</h2>
              <p className="text-muted-foreground">
                Choose focused tools for finance, people, stock, and industry operations. Add more when your workflows call for them, with access shaped around each role.
              </p>
            </div>
            <Link href="/modules" className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4">
              Explore all {catalogueModuleRegistry.length} products
            </Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredModules.map((mod) => (
              <Card key={mod.key}>
                <CardHeader>
                  <IconBadge size="lg"><mod.icon className="size-5" /></IconBadge>
                  <CardTitle className="mt-3">{mod.name}</CardTitle>
                  <CardDescription>{mod.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-xs font-medium text-muted-foreground">
                    {mod.status === "available" ? "Available" : "Coming soon"}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-24 px-6 py-20">
        <div className="space-y-3">
          <p className="public-eyebrow">Accounting</p>
          <AccountingModuleShowcase />
          <Link href="/modules/accounting" className="inline-block text-sm font-medium underline underline-offset-4">
            Explore Accounting
          </Link>
        </div>
        <div className="space-y-3">
          <p className="public-eyebrow">Fleet Management</p>
          <FleetModuleShowcase reverse />
          <Link href="/modules/fleet" className="inline-block text-sm font-medium underline underline-offset-4">
            Explore Fleet Management
          </Link>
        </div>
        <div className="space-y-3">
          <p className="public-eyebrow">Pharmacy Management</p>
          <PharmacyModuleShowcase />
          <Link href="/modules/pharmacy" className="inline-block text-sm font-medium underline underline-offset-4">
            Explore Pharmacy Management
          </Link>
        </div>
      </div>

      <WhyRockFrost />

      <HomepageFaq />

      {customers.length > 0 ? (
        <CustomerShowcase
          customers={customers}
          eyebrow="Customer feedback"
          headline="Trusted by growing organizations"
          description="Approved experiences shared by customers using Rock Frost in their work."
        />
      ) : null}

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Ready for a clearer way to run your organization?</h2>
            <p className="text-muted-foreground">Choose a module, combine a suite or talk to us about your workflow.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" nativeButton={false} render={<Link href="/solutions" />}>
              Solutions
            </Button>
            <Button nativeButton={false} render={<Link href="/contact" />}>
              Contact us
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
