import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JsonLd } from "@/components/seo/json-ld";
import { getModule, moduleRegistry } from "@/platform/modules/registry";
import { createPublicMetadata, MODULE_SEO, SITE_URL } from "@/lib/seo";
import { PublicHero } from "@/components/marketing/public-hero";

type ModuleKey = keyof typeof MODULE_SEO;

export function generateStaticParams() {
  return Object.keys(MODULE_SEO).map((moduleKey) => ({ moduleKey }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ moduleKey: string }>;
}): Promise<Metadata> {
  const { moduleKey } = await params;
  const seo = MODULE_SEO[moduleKey as ModuleKey];
  if (!seo) return {};
  return createPublicMetadata({
    title: seo.shortName,
    description: seo.description,
    path: `/modules/${moduleKey}`,
    keywords: [...seo.keywords],
  });
}

export default async function ModuleLandingPage({
  params,
}: {
  params: Promise<{ moduleKey: string }>;
}) {
  const { moduleKey } = await params;
  const seo = MODULE_SEO[moduleKey as ModuleKey];
  const module_ = getModule(moduleKey);
  if (!seo || !module_) notFound();

  const related = moduleRegistry.filter((item) => item.key !== moduleKey).slice(0, 3);

  return (
    <>
      <JsonLd data={[
        {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: `${module_.name} | Rock Frost Business Suite`,
          url: `${SITE_URL}/modules/${moduleKey}`,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description: seo.description,
          featureList: seo.features,
          provider: { "@id": `${SITE_URL}/#organization` },
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Modules", item: `${SITE_URL}/modules` },
            { "@type": "ListItem", position: 3, name: module_.name, item: `${SITE_URL}/modules/${moduleKey}` },
          ],
        },
      ]} />
      <PublicHero eyebrow="Rock Frost Business Suite module" title={seo.shortName} description={seo.description} actions={<>
            <Button size="lg" nativeButton={false} render={<Link href={`/contact?intent=demo&module=${moduleKey}`} />}>
              Request a demo
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href={`/contact?intent=module&module=${moduleKey}`} />}>
              Request this module
            </Button>
          </>} />

      <section className="public-section-tint">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">What you can manage</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {seo.features.map((feature) => (
              <Card key={feature}>
                <CardContent className="flex items-center gap-3 p-5">
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  <span className="font-medium">{feature}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Part of one secure business platform</h2>
            <p className="leading-7 text-muted-foreground">
              {module_.name} runs as an independent module with its own permissions, navigation, and organization-scoped
              data. Add other Rock Frost modules when your business needs them while keeping each team&apos;s operational
              boundaries clear.
            </p>
            <Link href="/solutions" className="font-medium text-primary underline-offset-4 hover:underline">
              Learn how the modular platform works
            </Link>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Explore related modules</h2>
            <ul className="mt-4 space-y-3">
              {related.map((item) => (
                <li key={item.key}>
                  <Link href={`/modules/${item.key}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
