import Link from "next/link";
import { Blocks, ShieldCheck, Layers, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const pillars = [
  {
    icon: Layers,
    title: "One workspace, every module",
    description:
      "Sign in once and switch between the business systems your organization runs on — Fleet Management, Installment Sales, and more as they come online — without juggling separate logins or tools.",
  },
  {
    icon: Blocks,
    title: "Modules stay independent",
    description:
      "Each module owns its own data, navigation, and workflows. Activating Installment Management never surfaces Fleet data, and vice versa — there's no bleed between unrelated parts of your business.",
  },
  {
    icon: ShieldCheck,
    title: "Built for real organizations",
    description:
      "Multi-tenant from the ground up: your organization's data is isolated from every other organization on the platform, with role-based access control scoped per module.",
  },
  {
    icon: Building2,
    title: "Grows with you",
    description:
      "Start with the modules you need today. The platform is designed so new modules — CRM, Inventory, Accounting, HR, and more — can be added later without disrupting what's already running.",
  },
];

export default function SolutionsPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm font-medium text-muted-foreground">Solutions</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Built to run your whole business, one module at a time.
          </h1>
          <p className="text-lg text-muted-foreground">
            Rock Frost Business Suite is a modular business operating platform. You activate the modules your
            organization needs; the platform keeps them working together without mixing their data.
          </p>
          <Button size="lg" nativeButton={false} render={<Link href="/contact" />}>
            Talk to us
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-6 sm:grid-cols-2">
            {pillars.map((pillar) => (
              <Card key={pillar.title}>
                <CardHeader>
                  <pillar.icon className="size-6 text-muted-foreground" />
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
            <p className="text-muted-foreground">Explore what&apos;s available today and what&apos;s on the roadmap.</p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/modules" />}>
            View modules
          </Button>
        </div>
      </section>
    </>
  );
}
