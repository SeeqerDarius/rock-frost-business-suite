import Link from "next/link";
import { Blocks, ShieldCheck, Layers, Building2, ArrowRight, ClipboardCheck, ChartNoAxesCombined } from "lucide-react";
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

const workflowSteps = [
  {
    icon: Blocks,
    title: "Record the work",
    description: "Use the modules that fit the work, from sales and stock to fleet, people, school, or property operations.",
  },
  {
    icon: ClipboardCheck,
    title: "Review and control",
    description: "Route supported activity through role-based permissions, reviews, and approvals in the relevant workflow.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "See the operating picture",
    description: "Use module reports and connected Accounting records to understand the activity your team has recorded.",
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
        <div className="max-w-2xl space-y-2">
          <p className="public-eyebrow">From daily work to oversight</p>
          <h2 className="text-2xl font-semibold tracking-tight">A practical way to connect operations</h2>
          <p className="text-muted-foreground">Keep specialist work in its module and connect supported activity where your organization needs it.</p>
        </div>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {workflowSteps.map((step, index) => (
            <li key={step.title} className="relative space-y-4 border-t pt-6">
              <div className="flex items-center gap-3">
                <IconBadge size="lg"><step.icon className="size-5" /></IconBadge>
                <span className="text-sm font-semibold text-muted-foreground">0{index + 1}</span>
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
        <Link href="/industries" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">
          Explore solutions by industry <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
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
