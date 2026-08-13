import Link from "next/link";
import { Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPublicMetadata } from "@/lib/seo";
import { formatGhs, MODULE_PRICES, PRICING_BUNDLES } from "@/lib/pricing";
import { moduleRegistry } from "@/platform/modules/registry";

export const metadata = createPublicMetadata({
  title: "Business Software Pricing Ghana",
  description: "Transparent Ghana cedi pricing for Rock Frost business management modules and industry suites, with included user seats and annual savings.",
  path: "/pricing",
  keywords: ["business software pricing Ghana", "school management software price Ghana", "ERP subscription Ghana"],
});

const names = new Map(moduleRegistry.map((module) => [module.key, module.name]));

export default function PricingPage() {
  return <>
    <section className="mx-auto max-w-6xl px-6 py-20 text-center">
      <p className="text-sm font-medium text-primary">Simple, modular pricing</p>
      <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Pay for the systems your organization actually uses.</h1>
      <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">All prices are in Ghana cedis. Every subscription includes secure cloud hosting, updates, backups, role-based access, and the listed user seats.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3"><Button nativeButton={false} render={<Link href="/contact?intent=demo" />}>Start a 14-day trial</Button><Button variant="outline" nativeButton={false} render={<Link href="/contact?intent=module" />}>Request a quote</Button></div>
    </section>
    <section className="border-y bg-muted/30"><div className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8"><h2 className="text-2xl font-semibold">Individual modules</h2><p className="mt-2 text-muted-foreground">Start with one module and add more whenever your operation grows. Annual billing provides approximately two months of savings.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{MODULE_PRICES.map((price) => <Card key={price.moduleKey} className="flex flex-col"><CardHeader><CardTitle>{names.get(price.moduleKey)}</CardTitle><CardDescription>From <span className="text-2xl font-semibold text-foreground">{formatGhs(price.monthlyGhs)}</span> / month</CardDescription></CardHeader><CardContent className="mt-auto space-y-4"><div className="space-y-2 text-sm"><p className="flex items-center gap-2"><Users className="size-4 text-primary" />{price.includedSeats} user seats included</p><p className="flex items-center gap-2"><Check className="size-4 text-primary" />{formatGhs(price.annualGhs)} when paid annually</p><p className="flex items-center gap-2"><Check className="size-4 text-primary" />Extra seats: {formatGhs(price.additionalSeatGhs)} / month</p></div><Button className="w-full" variant="outline" nativeButton={false} render={<Link href={`/contact?intent=module&module=${price.moduleKey}`} />}>Request this module</Button></CardContent></Card>)}</div>
    </div></section>
    <section className="mx-auto max-w-6xl px-6 py-16"><div className="mb-8"><h2 className="text-2xl font-semibold">Popular suites</h2><p className="mt-2 text-muted-foreground">Combined workflows at a lower price than subscribing to every module separately.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{PRICING_BUNDLES.map((bundle) => <Card key={bundle.name}><CardHeader><CardTitle>{bundle.name}</CardTitle><CardDescription><span className="text-2xl font-semibold text-foreground">{formatGhs(bundle.monthlyGhs)}</span> / month</CardDescription></CardHeader><CardContent><ul className="mb-5 space-y-2 text-sm">{bundle.modules.map((module) => <li key={module} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{module}</li>)}</ul><Button className="w-full" nativeButton={false} render={<Link href={`/contact?intent=demo&message=${encodeURIComponent(`I am interested in the ${bundle.name}.`)}`} />}>Request suite demo</Button></CardContent></Card>)}</div>
      <Card className="mt-6 border-primary/30 bg-primary/5"><CardHeader><CardTitle>Enterprise</CardTitle><CardDescription>From {formatGhs(4999)} per month for a tailored multi-module deployment with 50 user seats. Branches, migrations, onboarding, priority support, and custom workflows are quoted to scope.</CardDescription></CardHeader><CardContent><Button nativeButton={false} render={<Link href="/contact?intent=demo" />}>Talk to Rock Frost</Button></CardContent></Card>
      <p className="mt-6 text-sm text-muted-foreground">Students, guardians, patients, and customer records do not consume staff user seats. Transactional messaging, on-site training, large data migration, custom development, and payment-gateway charges may be quoted separately.</p>
    </section>
  </>;
}
