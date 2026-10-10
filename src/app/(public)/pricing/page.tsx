import Link from "next/link";
import { connection } from "next/server";
import { Check, PlusCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPublicMetadata, MODULE_SEO } from "@/lib/seo";
import { formatGhs, listAddonPrices, listModulePrices, listPricingBundles, PUBLIC_ADDONS } from "@/lib/pricing";
import { moduleRegistry, publicModuleRank, isPubliclyListedModule } from "@/platform/modules/registry";
import { PublicHero } from "@/components/marketing/public-hero";

export const metadata = createPublicMetadata({
  title: "Business Software Pricing Ghana",
  description: "Ghana cedi pricing for Rock Frost business modules and connected suites, with clear starting prices, included user seats, annual savings, and module-specific features.",
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
    <PublicHero centered eyebrow="ERP pricing in Ghana cedis" title="Choose a module. Grow into a connected suite." description="Start with an individual module at its clear monthly starting price, or choose a connected suite at its listed price. Plans include secure cloud hosting, updates, backups, role-based workspaces and the stated user seats. A 14-day trial can include up to three products." actions={<><Button nativeButton={false} render={<Link href="/subscribe" />}>Choose your plan</Button><Button variant="outline" nativeButton={false} render={<Link href="/contact?intent=demo" />}>Start a 14-day trial</Button></>} />
    <section className="public-section-tint"><div className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8"><h2 className="text-2xl font-semibold">Individual modules</h2><p className="mt-2 text-muted-foreground">Every module shows its starting monthly price, core capabilities, included staff seats, and annual price. Annual billing provides approximately two months of savings.</p></div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{modulePrices.filter((price) => isPubliclyListedModule(price.moduleKey)).sort((a, b) => publicModuleRank(a.moduleKey) - publicModuleRank(b.moduleKey)).map((price) => {
        const features = MODULE_SEO[price.moduleKey as keyof typeof MODULE_SEO]?.features ?? [];
        const moduleAddons = PUBLIC_ADDONS.filter((addon) => addon.moduleKey === price.moduleKey);
        return <Card id={`${price.moduleKey}-pricing`} key={price.moduleKey} className="flex scroll-mt-24 flex-col overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle>{names.get(price.moduleKey)}</CardTitle>
            <CardDescription>{moduleValue[price.moduleKey] ?? "A focused operating workspace for your organization"}</CardDescription>
            <div className="mt-4 rounded-lg bg-primary/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Starting from</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{formatGhs(price.monthlyGhs)}<span className="ml-1 text-sm font-normal text-muted-foreground">/ month</span></p>
            </div>
          </CardHeader>
          <CardContent className="mt-auto space-y-5">
            {features.length ? <div><p className="mb-2 text-sm font-medium">What this module helps you manage</p><ul className="space-y-2 text-sm text-muted-foreground">{features.slice(0, 3).map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul></div> : null}
            <div className="space-y-2 border-t pt-4 text-sm">
              <p className="flex items-center gap-2"><Users className="size-4 shrink-0 text-primary" />{price.includedSeats} staff seats included</p>
              <p className="flex items-center gap-2"><Check className="size-4 shrink-0 text-primary" />Annual plan: {formatGhs(price.annualGhs)}</p>
              <p className="flex items-center gap-2"><Check className="size-4 shrink-0 text-primary" />Additional staff seat: {formatGhs(price.additionalSeatGhs)} / month</p>
            </div>
            {moduleAddons.map((addon) => {
              const addonPrice = addonPriceMap.get(addon.key);
              return <div key={addon.key} id={`${addon.key}-pricing`} className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2"><PlusCircle className="size-4 shrink-0 text-primary" aria-hidden="true" /><h3 className="text-sm font-semibold">{addon.name}</h3></div>
                <p className="mt-2 text-sm text-muted-foreground">{addon.summary}</p>
                <p className="mt-3 text-sm font-medium">{addonPrice ? <>Starting from {formatGhs(addonPrice.monthlyGhs)} / month, {formatGhs(addonPrice.annualGhs)} annually</> : "Priced on request"}</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{addon.features.slice(0, 3).map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul>
                <Button className="mt-4 w-full" variant="outline" nativeButton={false} render={<Link href={`/contact?intent=demo&module=${addon.moduleKey}`} />}>Ask about this feature</Button>
              </div>;
            })}
            <Button className="w-full" nativeButton={false} render={<Link href={`/contact?intent=demo&module=${price.moduleKey}`} />}>Book a walkthrough</Button>
            <Button className="w-full" variant="outline" nativeButton={false} render={<Link href={`/subscribe?type=module&product=${price.moduleKey}`} />}>Choose {names.get(price.moduleKey)}</Button>
          </CardContent>
        </Card>;
      })}</div>
    </div></section>
    <section className="mx-auto max-w-6xl px-6 py-16"><div className="mb-8"><h2 className="text-2xl font-semibold">Connected ERP suites</h2><p className="mt-2 text-muted-foreground">Bring related operations and Accounting together at a lower price than subscribing to every module separately.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{pricingBundles.map((bundle) => <Card key={bundle.name}><CardHeader><CardTitle>{bundle.name}</CardTitle><CardDescription><span className="text-2xl font-semibold text-foreground">{formatGhs(bundle.monthlyGhs)}</span> / month</CardDescription></CardHeader><CardContent><ul className="mb-5 space-y-2 text-sm">{bundle.modules.map((module) => <li key={module} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{module}</li>)}</ul><Button className="w-full" nativeButton={false} render={<Link href={`/subscribe?type=bundle&product=${bundle.key}`} />}>Subscribe to this suite</Button></CardContent></Card>)}</div>
      <Card className="mt-6 border-primary/30 bg-primary/5"><CardHeader><CardTitle>Enterprise</CardTitle><CardDescription>From {formatGhs(4999)} per month for a tailored multi-module deployment with 50 user seats. Branches, migrations, onboarding, priority support, and custom workflows are quoted to scope.</CardDescription></CardHeader><CardContent><Button nativeButton={false} render={<Link href="/contact?intent=demo" />}>Talk to Rock Frost</Button></CardContent></Card>
      <p className="mt-6 text-sm text-muted-foreground">Students, guardians, patients, and customer records do not consume staff user seats. Individual module prices and connected suite prices come from the current platform pricing catalogue.</p>
    </section>
  </>;
}
