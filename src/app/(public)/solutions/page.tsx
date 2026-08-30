import Link from "next/link";
import { Blocks, ShieldCheck, Layers, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { createPublicMetadata } from "@/lib/seo";
import { PublicHero } from "@/components/marketing/public-hero";

export const metadata = createPublicMetadata({
  title: "Role-Based ERP Software Ghana",
  description: "Connect fleet, sales, finance, people, inventory, projects and industry operations through secure role-based ERP workflows.",
  path: "/solutions",
  keywords: ["modular business software", "business operations platform Ghana", "multi-tenant business software"],
});

const pillars = [
  {
    icon: Layers,
    title: "One platform, a workspace for every role",
    description:
      "Managers, accountants, drivers, vehicle owners, mechanics and frontline staff see the tasks, approvals and records that concern them, without juggling separate systems.",
  },
  {
    icon: Blocks,
    title: "Operations connect to finance",
    description:
      "Verified sales, collections and operational expenses can reach Accounting through controlled, auditable postings while each module keeps its specialist workflow.",
  },
  {
    icon: ShieldCheck,
    title: "Built for real organizations",
    description:
      "Your organization's data is isolated from every other organization, with permissions, private support conversations, approval controls and audit history scoped to the right people.",
  },
  {
    icon: Building2,
    title: "Grows with you",
    description:
      "Start with the modules you need today and add Hotel, School, or any other available suite later without disruption.",
  },
];

export default function SolutionsPage() {
  return (
    <>
      <PublicHero eyebrow="Modular, role-based ERP" title="Your operation connected from action to accounts." description="Give every role a focused workspace, route work through the right approvals and turn verified activity into reliable business records." actions={<Button size="lg" nativeButton={false} render={<Link href="/pricing" />}>Explore plans</Button>} />

      <section className="public-section-tint">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-6 sm:grid-cols-2">
            {pillars.map((pillar) => (
              <Card key={pillar.title}>
                <CardHeader>
                  <IconBadge size="lg"><pillar.icon className="size-5" /></IconBadge>
                  <CardTitle className="mt-3">{pillar.title}</CardTitle>
                  <CardDescription>{pillar.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">See which modules fit your organization</h2>
            <p className="text-muted-foreground">Explore available modules, including Hotel, School, and Pharmacy vertical suites.</p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/modules" />}>
            View modules
          </Button>
        </div>
      </section>
    </>
  );
}
