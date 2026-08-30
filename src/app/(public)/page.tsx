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
import { buildShowcaseCustomers } from "@/lib/showcase-composition";
import { PublicHero } from "@/components/marketing/public-hero";
import { ModuleBlocksIllustration } from "@/components/marketing/module-blocks-illustration";
import { AccountingModuleShowcase } from "@/components/marketing/module-showcases/accounting";
import { FleetModuleShowcase } from "@/components/marketing/module-showcases/fleet";
import { PharmacyModuleShowcase } from "@/components/marketing/module-showcases/pharmacy";
import { WhyRockFrost } from "@/components/marketing/why-rock-frost";
import { HomepageFaq } from "@/components/marketing/homepage-faq";

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
  const [showcaseOrganizations, platformOrganization] = await Promise.all([
    readShowcaseOrganizations(),
    findPlatformOrganizationMetadata(),
  ]);
  const marketing = readPlatformMarketing(platformOrganization?.metadata);
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
  const { customers, hasDemoEntries } = buildShowcaseCustomers([...externalCustomers, ...tenantCustomers]);

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
      <PublicHero eyebrow="A role-based ERP built for Ghana" title="Run the work. See the money. Stay in control." description="Connect finance, fleet, sales, people, stock and industry operations in one secure platform. Every person gets the workspace, approvals and information their role requires." actions={<>
            <Button size="lg" nativeButton={false} render={<Link href="/subscribe" />}>Start your subscription</Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/pricing" />}>See pricing</Button>
          </>}>
        <ModuleBlocksIllustration className="mx-auto h-auto w-full max-w-sm" />
      </PublicHero>
      {marketing.showcaseEnabled && customers.length > 0 ? (
        <CustomerShowcase
          customers={customers}
          eyebrow={marketing.eyebrow}
          headline={marketing.headline}
          description={marketing.description}
          showDemoDisclosure={hasDemoEntries}
        />
      ) : null}

      <section className="public-section-tint">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">Build the ERP your organization needs</h2>
              <p className="text-muted-foreground">
                Start with one operational system or connect several. Confirmed business activity can flow into Accounting without giving every user access to everything.
              </p>
            </div>
            <Link href="/modules" className="text-sm font-medium underline underline-offset-4">
              View all modules
            </Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalogueModuleRegistry.map((mod) => (
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
