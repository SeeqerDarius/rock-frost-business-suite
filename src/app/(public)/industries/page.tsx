import Link from "next/link";
import { Truck, Wallet, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { createPublicMetadata } from "@/lib/seo";
import { PublicHero } from "@/components/marketing/public-hero";

export const metadata = createPublicMetadata({
  title: "Business Software for Ghanaian Industries",
  description: "Business management software for transport and logistics, retail, installment sales, consumer finance, and multi-department organizations in Ghana and Africa.",
  path: "/industries",
  keywords: ["business software Ghana industries", "transport software Ghana", "retail management software Africa"],
});

const industries = [
  {
    icon: Truck,
    name: "Transportation & Logistics",
    description:
      "Fleet operators managing vehicles, drivers, and owner relationships across multiple companies or branches, with maintenance, insurance, and work-and-pay contracts to track.",
  },
  {
    icon: Wallet,
    name: "Retail & Consumer Finance",
    description:
      "Businesses selling on installment or layaway terms, tracking customer accounts, collections, product performance, and staff activity across a distributed sales team.",
  },
  {
    icon: Building2,
    name: "Multi-department organizations",
    description:
      "Any organization running several distinct business functions that shouldn't share data or navigation, but do benefit from one shared login, one workspace, and consistent access control.",
  },
];

export default function IndustriesPage() {
  return (
    <>
      <PublicHero eyebrow="Industries" title="Technology shaped around real operating environments." description="Our modular platform and bespoke engineering capability serve organizations whose workflows, teams, customers, and regulatory responsibilities demand more than generic software." />

      <section className="public-section-tint">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-4 sm:grid-cols-3">
            {industries.map((industry) => (
              <Card key={industry.name}>
                <CardHeader>
                  <IconBadge size="lg"><industry.icon className="size-5" /></IconBadge>
                  <CardTitle className="mt-3">{industry.name}</CardTitle>
                  <CardDescription>{industry.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Not seeing your industry?</h2>
            <p className="text-muted-foreground">The module system is built to extend beyond these. Tell us what you need.</p>
          </div>
          <Button nativeButton={false} render={<Link href="/contact" />}>
            Get in touch
          </Button>
        </div>
      </section>
    </>
  );
}
