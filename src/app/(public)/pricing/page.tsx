import Link from "next/link";
import { connection } from "next/server";
import { Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPublicMetadata } from "@/lib/seo";
import { formatGhs, listModulePrices, listPricingBundles } from "@/lib/pricing";
import { moduleRegistry } from "@/platform/modules/registry";
import { PublicHero } from "@/components/marketing/public-hero";

export const metadata = createPublicMetadata({
  title: "Business Software Pricing Ghana",
  description: "Transparent Ghana cedi pricing for Rock Frost business management modules and industry suites, with included user seats and annual savings.",
  path: "/pricing",
  keywords: ["business software pricing Ghana", "school management software price Ghana", "ERP subscription Ghana"],
});

const names = new Map(moduleRegistry.map((module) => [module.key, module.name]));

const moduleValue: Record<string, string> = {
  fleet: "For fleet teams, drivers, vehicle owners and maintenance workflows",
  installment: "For customer accounts, collections and field sales teams",
  crm: "For leads, relationships, deals and sales follow-up",
  inventory: "For stock, warehouses, purchasing and supplier operations",
  accounting: "For ledgers, cash, receivables, planning and financial reporting",
  hr: "For employee records, onboarding, leave and performance",
  projects: "For projects, tasks, milestones and delivery visibility",
  pos: "For tills, sales, returns and stock-connected retail",
  analytics: "For permission-aware trends across connected modules",
  hotel: "For reservations, guests, rooms, folios and hotel operations",
  school: "For admissions, academics, fees, attendance and school operations",
  hostel: "For buildings, beds, allocations, fees and wardens",
  pharmacy: "For medicines, prescriptions, dispensing and controlled stock",
  hospital: "For patient, clinical, ward, diagnostic and billing workflows",
};

export default async function PricingPage() {
  // Prices are database-backed and operator-editable. Tie rendering to the
  // incoming request so builds never require database access.
  await connection();
  const [modulePrices, pricingBundles] = await Promise.all([listModulePrices(), listPricingBundles()]);
  return <>
    <PublicHero centered eyebrow="ERP pricing in Ghana cedis" title="Start with what you need. Add more as you grow." description="Every plan includes secure cloud hosting, updates, backups, role-based workspaces and the listed user seats. Choose one module or save with a connected suite. A 14-day trial can include up to three products." actions={<><Button nativeButton={false} render={<Link href="/subscribe" />}>Choose your plan</Button><Button variant="outline" nativeButton={false} render={<Link href="/contact?intent=demo" />}>Start a 14-day trial</Button></>} />
    <section className="public-section-tint"><div className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8"><h2 className="text-2xl font-semibold">Individual modules</h2><p className="mt-2 text-muted-foreground">Start with one module and add more whenever your operation grows. Annual billing provides approximately two months of savings.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{modulePrices.map((price) => <Card key={price.moduleKey} className="flex flex-col"><CardHeader><CardTitle>{names.get(price.moduleKey)}</CardTitle><CardDescription className="space-y-2"><span className="block">{moduleValue[price.moduleKey] ?? "A focused operating workspace for your organization"}</span><span className="block">From <span className="text-2xl font-semibold text-foreground">{formatGhs(price.monthlyGhs)}</span> / month</span></CardDescription></CardHeader><CardContent className="mt-auto space-y-4"><div className="space-y-2 text-sm"><p className="flex items-center gap-2"><Users className="size-4 text-primary" />{price.includedSeats} user seats included</p><p className="flex items-center gap-2"><Check className="size-4 text-primary" />{formatGhs(price.annualGhs)} when paid annually</p><p className="flex items-center gap-2"><Check className="size-4 text-primary" />Extra seats: {formatGhs(price.additionalSeatGhs)} / month</p></div><Button className="w-full" variant="outline" nativeButton={false} render={<Link href={`/subscribe?type=module&product=${price.moduleKey}`} />}>Subscribe to this module</Button></CardContent></Card>)}</div>
    </div></section>
    <section className="mx-auto max-w-6xl px-6 py-16"><div className="mb-8"><h2 className="text-2xl font-semibold">Connected ERP suites</h2><p className="mt-2 text-muted-foreground">Bring related operations and Accounting together at a lower price than subscribing to every module separately.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{pricingBundles.map((bundle) => <Card key={bundle.name}><CardHeader><CardTitle>{bundle.name}</CardTitle><CardDescription><span className="text-2xl font-semibold text-foreground">{formatGhs(bundle.monthlyGhs)}</span> / month</CardDescription></CardHeader><CardContent><ul className="mb-5 space-y-2 text-sm">{bundle.modules.map((module) => <li key={module} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{module}</li>)}</ul><Button className="w-full" nativeButton={false} render={<Link href={`/subscribe?type=bundle&product=${bundle.key}`} />}>Subscribe to this suite</Button></CardContent></Card>)}</div>
      <Card className="mt-6 border-primary/30 bg-primary/5"><CardHeader><CardTitle>Enterprise</CardTitle><CardDescription>From {formatGhs(4999)} per month for a tailored multi-module deployment with 50 user seats. Branches, migrations, onboarding, priority support, and custom workflows are quoted to scope.</CardDescription></CardHeader><CardContent><Button nativeButton={false} render={<Link href="/contact?intent=demo" />}>Talk to Rock Frost</Button></CardContent></Card>
      <p className="mt-6 text-sm text-muted-foreground">Students, guardians, patients, and customer records do not consume staff user seats. Transactional messaging, on-site training, large data migration, custom development, and payment-gateway charges may be quoted separately.</p>
    </section>
  </>;
}
