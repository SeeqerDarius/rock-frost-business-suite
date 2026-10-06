import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JsonLd } from "@/components/seo/json-ld";
import { createPublicMetadata, SITE_URL } from "@/lib/seo";
import { getModule } from "@/platform/modules/registry";
import { PublicHero } from "@/components/marketing/public-hero";
import { RESOURCE_ARTICLES, getResourceArticle } from "@/lib/resource-articles";

export function generateStaticParams() {
  return RESOURCE_ARTICLES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) return {};
  return createPublicMetadata({
    title: article.title,
    description: article.description,
    path: `/resources/${slug}`,
  });
}

export default async function ResourceArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) notFound();

  const relatedModule = article.relatedModuleKey ? getModule(article.relatedModuleKey) : undefined;
  const relatedHref = relatedModule ? `/modules/${article.relatedModuleKey}` : article.relatedPath ?? "/contact";
  const url = `${SITE_URL}/resources/${slug}`;

  return (
    <>
      <JsonLd data={[
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.description,
          url,
          publisher: { "@id": `${SITE_URL}/#organization` },
          mainEntityOfPage: url,
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/resources` },
            { "@type": "ListItem", position: 3, name: article.title, item: url },
          ],
        },
        ...(article.faqs
          ? [{
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: article.faqs.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: { "@type": "Answer", text: faq.answer },
              })),
            }]
          : []),
      ]} />

      <PublicHero eyebrow={article.eyebrow} title={article.title} description={article.dek} />

      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="space-y-12">
          {article.sections.map((section) => (
            <div key={section.heading}>
              <h2 className="text-2xl font-semibold tracking-tight">{section.heading}</h2>
              {section.body ? (
                <div className="mt-4 space-y-4">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="leading-7 text-muted-foreground">{paragraph}</p>
                  ))}
                </div>
              ) : null}
              {section.list ? (
                <ul className="mt-4 space-y-3">
                  {section.list.map((item) => (
                    <li key={item} className="flex gap-3 leading-7 text-muted-foreground">
                      <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}

          {article.faqs ? (
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
              <div className="mt-6 space-y-6">
                {article.faqs.map((faq) => (
                  <div key={faq.question}>
                    <h3 className="font-semibold">{faq.question}</h3>
                    <p className="mt-2 leading-7 text-muted-foreground">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <Card className="mt-16">
          <CardContent className="flex flex-col items-start justify-between gap-4 p-8 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">See it running in Rock Frost</h2>
              <p className="text-muted-foreground">
                {relatedModule ? `${relatedModule.name} is available as part of the platform today.` : "Talk to us about how your business runs today."}
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <Button nativeButton={false} render={<Link href={relatedHref} />}>
                {article.relatedLabel}
              </Button>
              {relatedModule ? (
                <Button variant="outline" nativeButton={false} render={<Link href={`/contact?intent=demo&module=${article.relatedModuleKey}`} />}>
                  Request a demo
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
