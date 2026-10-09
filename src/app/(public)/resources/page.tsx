import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createPublicMetadata } from "@/lib/seo";
import { PublicHero } from "@/components/marketing/public-hero";
import { RESOURCE_ARTICLES } from "@/lib/resource-articles";

export const metadata = createPublicMetadata({
  title: "Guides for Running a Business in Ghana",
  description: "Practical guides on hotel, inventory, fleet and school operations in Ghana, and what business management software actually costs.",
  path: "/resources",
  keywords: ["business management software Ghana guides", "hotel software Ghana guide", "inventory control Ghana", "fleet management Ghana", "school management Ghana"],
});

export default function ResourcesPage() {
  return (
    <>
      <PublicHero
        eyebrow="Guides"
        title="Practical guides for running your business in Ghana"
        description="Straightforward answers to the questions you'd ask before choosing or setting up business management software, written from how the workflows actually behave."
      />

      <section className="public-section-tint">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RESOURCE_ARTICLES.map((article) => (
              <Card key={article.slug}>
                <CardHeader>
                  <p className="public-eyebrow">{article.eyebrow}</p>
                  <CardTitle className="mt-1">{article.title}</CardTitle>
                  <CardDescription>{article.dek}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/resources/${article.slug}`} />}>
                    Read the guide
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Ready to see it running?</h2>
            <p className="text-muted-foreground">Pick a module or talk to us about how your business runs today.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" nativeButton={false} render={<Link href="/modules" />}>
              Browse modules
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
