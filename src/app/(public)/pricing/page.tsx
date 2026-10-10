import Link from "next/link";
import { connection } from "next/server";
import { Check, PlusCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPublicMetadata } from "@/lib/seo";
import { formatGhs, listAddonPrices, listModulePrices, listPricingBundles, PUBLIC_ADDONS } from "@/lib/pricing";
import { moduleRegistry, publicModuleRank, isPubliclyListedModule } from "@/platform/modules/registry";
import { PublicHero } from "@/components/marketing/public-hero";

export const metadata = createPublicMetadata({
  title: "Business Software Pricing Ghana",
  description: "Ghana cedi pricing for Rock Frost business modules and connected suites: starting prices, included user seats, annual savings, and optional add-ons such as School Assignments & Assessments.",
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
  const [modulePrices, pricingBundles, addonPrices] = await Promise.all([listModulePrices(), listPricingBundles(), listAddonPrices()]);
  const addonPriceMap = new Map(addonPrices.map((price) => [price.addonKey, price]));
  return <>
    <PublicHero centered eyebrow="ERP pricing in Ghana cedis" title="Start with what you need. Add more as you grow." description="Every plan includes secure cloud hosting, updates, backups, role-based workspaces and the listed user seats. Choose one module or save with a connected suite. A 14-day trial can include up to three products." actions={<><Button nativeButton={false} render={<Link href="/subscribe" />}>Choose your plan</Button><Button variant="outline" nativeButton={false} render={<Link href="/contact?intent=demo" />}>Start a 14-day trial</Button></>} />
    <section className="public-section-tint"><div className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8"><h2 className="text-2xl font-semibold">Individual modules</h2><p className="mt-2 text-muted-foreground">Start with one module and add more whenever your operation grows. Annual billing provides approximately two months of savings.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{modulePrices.filter((price) => isPubliclyListedModule(price.moduleKey)).sort((a, b) => publicModuleRank(a.moduleKey) - publicModuleRank(b.moduleKey)).map((price) => <Card id={`${price.moduleKey}-pricing`} key={price.moduleKey} className="flex scroll-mt-24 flex-col"><CardHeader><CardTitle>{names.get(price.moduleKey)}</CardTitle><CardDescription className="space-y-2"><span className="block">{moduleValue[price.moduleKey] ?? "A focused operating workspace for your organization"}</span><span className="block">Starting from <span className="text-2xl font-semibold text-foreground">{formatGhs(price.monthlyGhs)}</span> / month</span></CardDescription></CardHeader><CardContent className="mt-auto space-y-4"><div className="space-y-2 text-sm"><p className="flex items-center gap-2"><Users className="size-4 text-primary" />{price.includedSeats} user seats included</p><p className="flex items-center gap-2"><Check className="size-4 text-primary" />{formatGhs(price.annualGhs)} when paid annually</p><p className="flex items-center gap-2"><Check className="size-4 text-primary" />Extra seats: {formatGhs(price.additionalSeatGhs)} / month</p></div><Button className="w-full" nativeButton={false} render={<Link href={`/contact?intent=demo&module=${price.moduleKey}`} />}>Book a walkthrough</Button><Button className="w-full" variant="outline" nativeButton={false} render={<Link href={`/subscribe?type=module&product=${price.moduleKey}`} />}>Subscribe to this module</Button></CardContent></Card>)}</div>
    </div></section>
    <section id="add-ons" className="mx-auto max-w-6xl scroll-mt-24 px-6 pt-16">
      <div className="mb-8"><h2 className="text-2xl font-semibold">Optional add-ons</h2><p className="mt-2 text-muted-foreground">Extend a module with a separately priced add-on, enabled for your organization only when you choose it. Add-ons are not part of any suite price.</p></div>
      <div className="grid gap-4 md:grid-cols-2">{PUBLIC_ADDONS.map((addon) => {
        const price = addonPriceMap.get(addon.key);
        const parent = names.get(addon.moduleKey);
        return <Card key={addon.key} id={`${addon.key}-pricing`} className="flex scroll-mt-24 flex-col"><CardHeader><CardTitle className="flex items-center gap-2"><PlusCircle className="size-5 text-primary" aria-hidden="true" />{addon.name}</CardTitle><CardDescription className="space-y-2"><span className="block">{addon.summary}</span><span className="block">{price ? <>Starting from <span className="text-2xl font-semibold text-foreground">{formatGhs(price.monthlyGhs)}</span> / month, {formatGhs(price.annualGhs)} when paid annually</> : <span className="font-medium text-foreground">Priced on request</span>}</span><span className="block text-xs">Requires <Link href={`/modules/${addon.moduleKey}`} className="underline underline-offset-4">{parent}</Link>. Students submit through the Parent and Student portal, arranged with Rock Frost.</span></CardDescription></CardHeader><CardContent className="mt-auto space-y-4"><ul className="space-y-2 text-sm">{addon.features.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul><Button className="w-full" variant="outline" nativeButton={false} render={<Link href={`/contact?intent=demo&module=${addon.moduleKey}`} />}>Ask about this add-on</Button></CardContent></Card>;
      })}</div>
    </section>
    <section className="mx-auto max-w-6xl px-6 py-16"><div className="mb-8"><h2 className="text-2xl font-semibold">Connected ERP suites</h2><p className="mt-2 text-muted-foreground">Bring related operations and Accounting together at a lower price than subscribing to every module separately.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{pricingBundles.map((bundle) => <Card key={bundle.name}><CardHeader><CardTitle>{bundle.name}</CardTitle><CardDescription><span className="text-2xl font-semibold text-foreground">{formatGhs(bundle.monthlyGhs)}</span> / month</CardDescription></CardHeader><CardContent><ul className="mb-5 space-y-2 text-sm">{bundle.modules.map((module) => <li key={module} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{module}</li>)}</ul><Button className="w-full" nativeButton={false} render={<Link href={`/subscribe?type=bundle&product=${bundle.key}`} />}>Subscribe to this suite</Button></CardContent></Card>)}</div>
      <Card className="mt-6 border-primary/30 bg-primary/5"><CardHeader><CardTitle>Enterprise</CardTitle><CardDescription>From {formatGhs(4999)} per month for a tailored multi-module deployment with 50 user seats. Branches, migrations, onboarding, priority support, and custom workflows are quoted to scope.</CardDescription></CardHeader><CardContent><Button nativeButton={false} render={<Link href="/contact?intent=demo" />}>Talk to Rock Frost</Button></CardContent></Card>
      <p className="mt-6 text-sm text-muted-foreground">Students, guardians, patients, and customer records do not consume staff user seats. Transactional messaging, on-site training, large data migration, custom development, and payment-gateway charges may be quoted separately.</p>
    </section>
  </>;
}
