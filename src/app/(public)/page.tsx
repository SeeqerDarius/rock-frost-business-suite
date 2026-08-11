import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { moduleRegistry } from "@/platform/modules/registry";
import { JsonLd } from "@/components/seo/json-ld";
import { createPublicMetadata, DEFAULT_DESCRIPTION, SITE_URL } from "@/lib/seo";
import { db } from "@/lib/db";
import { PUBLIC_SHOWCASE_FILTER, readPublicShowcase } from "@/lib/public-showcase";
import { CustomerShowcase } from "@/components/marketing/customer-showcase";
import { findPlatformOrganizationMetadata, readPlatformMarketing } from "@/lib/platform-marketing";
import { buildShowcaseCustomers } from "@/lib/showcase-composition";

export const metadata = createPublicMetadata({
  title: "Business Management Software Ghana",
  description: DEFAULT_DESCRIPTION,
  path: "/",
  keywords: ["business management software Ghana", "ERP software Ghana", "business software Africa", "modular SaaS platform"],
});

export default async function HomePage() {
  const [showcaseOrganizations, platformOrganization] = await Promise.all([
    db.organization.findMany({
      where: PUBLIC_SHOWCASE_FILTER,
      select: { id: true, name: true, industry: true, metadata: true },
      orderBy: { name: "asc" },
      take: 12,
    }),
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
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm font-medium text-muted-foreground">Rock Frost Business Suite</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            One platform. Every business system your organization runs on.
          </h1>
          <p className="text-lg text-muted-foreground">
            Activate independent management modules, including fleet and installment sales, from a single,
            unified workspace, without mixing unrelated business data together.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
              Sign in
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/contact" />}>
              Request a demo
            </Button>
          </div>
        </div>
      </section>

      {marketing.showcaseEnabled && customers.length > 0 ? (
        <CustomerShowcase
          customers={customers}
          eyebrow={marketing.eyebrow}
          headline={marketing.headline}
          description={marketing.description}
          showDemoDisclosure={hasDemoEntries}
        />
      ) : null}

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">Modules</h2>
              <p className="text-muted-foreground">
                Each module is an independent business system with its own data, navigation, and workflows.
              </p>
            </div>
            <Link href="/modules" className="text-sm font-medium underline underline-offset-4">
              View all modules
            </Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moduleRegistry.map((mod) => (
              <Card key={mod.key}>
                <CardHeader>
                  <mod.icon className="size-6 text-muted-foreground" />
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

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">See how it fits your organization</h2>
            <p className="text-muted-foreground">Read about the platform&apos;s approach, or tell us what you need.</p>
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
