import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { JsonLd } from "@/components/seo/json-ld";
import { catalogueModuleRegistry, getModule } from "@/platform/modules/registry";
import { createPublicMetadata, MODULE_SEO, SITE_URL } from "@/lib/seo";
import { PublicHero } from "@/components/marketing/public-hero";
import { ModuleShowcase } from "@/components/marketing/module-showcase";
import { ConversionButtonLink } from "@/components/marketing/conversion-link";

type ModuleKey = keyof typeof MODULE_SEO;

export function generateStaticParams() {
  return catalogueModuleRegistry.map(({ key: moduleKey }) => ({ moduleKey }));
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

  const related = catalogueModuleRegistry.filter((item) => item.key !== moduleKey).slice(0, 3);
  const content = "content" in seo ? seo.content : undefined;
  const isFleet = moduleKey === "fleet";
  const faqSchema = content
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: content.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      }
    : null;

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
        ...(faqSchema ? [faqSchema] : []),
      ]} />
      <PublicHero eyebrow={isFleet ? "Fleet control for Ghanaian operators" : "Rock Frost Business Suite module"} title={seo.shortName} description={seo.description} actions={<>
            <ConversionButtonLink size="lg" href={`/contact?intent=demo&module=${moduleKey}`} eventName="Acquisition CTA" eventProperties={{ module: moduleKey, action: "demo", location: "module_hero" }}>
              {isFleet ? "Book a Fleet walkthrough" : "Request a demo"}
            </ConversionButtonLink>
            <ConversionButtonLink size="lg" variant="outline" href={isFleet ? "/pricing#fleet-pricing" : `/contact?intent=module&module=${moduleKey}`} eventName="Acquisition CTA" eventProperties={{ module: moduleKey, action: isFleet ? "pricing" : "module_request", location: "module_hero" }}>
              {isFleet ? "See Fleet pricing" : "Request this module"}
            </ConversionButtonLink>
          </>} />

      <ModuleShowcase moduleKey={moduleKey} />

      {isFleet ? (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <Card className="overflow-hidden border-primary/30 bg-primary/5">
            <CardContent className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <p className="public-eyebrow">14-day assisted Fleet pilot</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Test your real fleet workflow before you commit</h2>
                <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                  Start with a short fit call. We will then walk through vehicles, drivers, maintenance, compliance, payments, and work-and-pay using the parts that match your operation.
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">What happens next</p>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li>1. Tell us how your fleet operates.</li>
                  <li>2. See a walkthrough focused on your workflow.</li>
                  <li>3. Start an assisted pilot if the system fits.</li>
                </ol>
                <ConversionButtonLink className="mt-2 w-full" href="/contact?intent=demo&module=fleet" eventName="Acquisition CTA" eventProperties={{ module: "fleet", action: "pilot", location: "pilot_panel" }}>
                  Book the Fleet fit call
                </ConversionButtonLink>
                <p className="text-xs text-muted-foreground">No payment is required to request the walkthrough.</p>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {content ? (
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-3xl space-y-4">
            <p className="public-eyebrow">Built for real operations</p>
            <h2 className="text-3xl font-semibold tracking-tight">Who this software is for</h2>
            <p className="text-lg leading-8 text-muted-foreground">{content.audience}</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {content.outcomes.map((outcome) => (
              <Card key={outcome.title}>
                <CardContent className="space-y-3 p-6">
                  <h3 className="text-lg font-semibold">{outcome.title}</h3>
                  <p className="leading-7 text-muted-foreground">{outcome.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

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

      {content ? (
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <p className="public-eyebrow">Connected workflow</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">How your team can use it</h2>
              <ol className="mt-6 space-y-4">
                {content.workflows.map((workflow, index) => (
                  <li key={workflow} className="flex gap-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{index + 1}</span>
                    <span className="pt-1 leading-7 text-muted-foreground">{workflow}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="public-eyebrow">Questions and answers</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
              <div className="mt-6 space-y-6">
                {content.faqs.map((faq) => (
                  <div key={faq.question}>
                    <h3 className="font-semibold">{faq.question}</h3>
                    <p className="mt-2 leading-7 text-muted-foreground">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

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
