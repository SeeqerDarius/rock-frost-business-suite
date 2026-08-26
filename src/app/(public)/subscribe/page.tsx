import { CreditCard, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { isBotProtectionConfigured } from "@/lib/bot-protection";
import { createContactFormProof } from "@/lib/contact-form-protection";
import { formatGhs, listModulePrices, listPricingBundles } from "@/lib/pricing";
import { createPublicMetadata } from "@/lib/seo";
import { getModule } from "@/platform/modules/registry";
import { startPublicSubscription } from "./actions";

export const metadata = createPublicMetadata({
  title: "Subscribe",
  description: "Create your Rock Frost workspace and continue to secure payment.",
  path: "/subscribe",
  noIndex: true,
});

const errors: Record<string, string> = { verification: "We could not verify this request. Refresh and try again.", invalid: "Check the required details and try again.", product: "Choose an available product.", "platform-account": "Use a customer email address. Platform operator accounts cannot own customer workspaces.", "too-soon": "An account was just prepared for this email. Check your inbox before trying again.", unavailable: "Account setup is temporarily unavailable. Please contact Rock Frost." };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ type?: string; product?: string; cycle?: string; error?: string }> }) {
  const params = await searchParams;
  const [modulePrices, pricingBundles] = await Promise.all([listModulePrices(), listPricingBundles()]);
  const productType = params.type === "bundle" ? "BUNDLE" : "MODULE";
  const modulePrice = modulePrices.find((entry) => entry.moduleKey === params.product);
  const bundle = pricingBundles.find((entry) => entry.key === params.product);
  const defaultProduct = productType === "BUNDLE" ? bundle?.key ?? pricingBundles[0]?.key ?? "" : modulePrice?.moduleKey ?? modulePrices[0]?.moduleKey ?? "";
  const turnstile = isBotProtectionConfigured();
  const proof = turnstile ? null : createContactFormProof(process.env.NEXTAUTH_SECRET ?? "");
  return <section className="mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-[0.8fr_1.2fr]">
    <div className="space-y-5"><p className="text-sm font-medium text-primary">Subscribe without a demo</p><h1 className="text-4xl font-semibold tracking-tight">Create your workspace and continue to secure payment.</h1><p className="leading-7 text-muted-foreground">We verify your email first. After you set your password and sign in, Paystack payment activates the selected product automatically. No platform-owner approval is required.</p><div className="space-y-3 text-sm"><p className="flex gap-2"><ShieldCheck className="size-5 text-primary" />Your organization remains isolated from every other customer.</p><p className="flex gap-2"><CreditCard className="size-5 text-primary" />Payment happens only after your account is ready.</p></div></div>
    <Card><CardHeader><CardTitle>Organization and subscription</CardTitle><CardDescription>Annual plans include approximately two months of savings.</CardDescription></CardHeader><CardContent>
      {params.error && errors[params.error] ? <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{errors[params.error]}</p> : null}
      <form action={startPublicSubscription} className="space-y-4">
        {proof ? <input type="hidden" name="contactProof" value={proof} /> : null}<input className="hidden" name="website" tabIndex={-1} autoComplete="off" />
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="fullName">Your full name</Label><Input id="fullName" name="fullName" required /></div><div className="space-y-2"><Label htmlFor="organizationName">Organization name</Label><Input id="organizationName" name="organizationName" required /></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="email">Work email</Label><Input id="email" name="email" type="email" required /></div><div className="space-y-2"><Label htmlFor="phone">Phone or WhatsApp</Label><Input id="phone" name="phone" type="tel" /></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="productType">Product type</Label><select id="productType" name="productType" defaultValue={productType} className="h-10 w-full rounded-md border bg-background px-3"><option value="MODULE">Individual module</option><option value="BUNDLE">Combined suite</option></select></div><div className="space-y-2"><Label htmlFor="billingCycle">Billing period</Label><select id="billingCycle" name="billingCycle" defaultValue={params.cycle === "monthly" ? "MONTHLY" : "ANNUAL"} className="h-10 w-full rounded-md border bg-background px-3"><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></div></div>
        <div className="space-y-2"><Label htmlFor="productKey">Product</Label><select id="productKey" name="productKey" defaultValue={defaultProduct} className="h-10 w-full rounded-md border bg-background px-3">{modulePrices.map((entry) => <option key={entry.moduleKey} value={entry.moduleKey}>{getModule(entry.moduleKey)?.name} ({formatGhs(entry.monthlyGhs)}/month)</option>)}{pricingBundles.map((entry) => <option key={entry.key} value={entry.key}>{entry.name} suite ({formatGhs(entry.monthlyGhs)}/month)</option>)}</select><p className="text-xs text-muted-foreground">Choose a module when Product type is Individual module, or a suite when Product type is Combined suite.</p></div>
        {turnstile ? <TurnstileWidget action="subscribe" /> : null}<Button className="w-full" type="submit">Verify email and prepare subscription</Button>
      </form>
    </CardContent></Card>
  </section>;
}
