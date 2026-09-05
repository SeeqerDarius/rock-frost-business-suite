import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { db } from "@/lib/db";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";
import { activateSubscriptionAction, cancelSubscriptionAction, createSubscriptionAction, updateSubscriptionSeatLimitAction } from "./actions";
import { updateModulePricePlan, updatePricingBundlePrice } from "./pricing-actions";
import { getOrganizationSeatUsage } from "@/platform/subscriptions/seats";
import { listModulePrices, listPricingBundles } from "@/lib/pricing";
import { SubscriptionQuoteFields } from "./subscription-quote-fields";
import { catalogueModuleKeys, getModule } from "@/platform/modules/registry";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Enter a valid subscription and seat limit.",
  "seats-below-usage": "The seat limit cannot be lower than the module's current assigned users.",
  seats: "The seat limit could not be updated.",
  "invalid-price": "Enter a valid monthly price, annual price, seat count, and extra-seat price.",
  "price-not-found": "That module price could not be found.",
  "invalid-bundle": "Enter a valid suite name and monthly price.",
  "bundle-not-found": "That suite price could not be found.",
  create: "The subscription could not be created.",
  activate: "The subscription could not be activated.",
  cancel: "The subscription could not be cancelled.",
  "cancel-paystack-unregistered": "Automatic renewal isn't fully registered with Paystack yet. Cancel it directly from Paystack's dashboard first, then cancel local access.",
};
const SAVED_MESSAGES: Record<string, string> = { price: "Module price updated.", bundle: "Suite price updated." };

export default async function PlatformSubscriptionsPage({ searchParams }: { searchParams: Promise<{ error?: string; seats?: string; saved?: string }> }) {
  await requirePlatformOperator();
  const { error, seats, saved } = await searchParams;
  const platformAnchorIds = await getPlatformAnchorOrganizationIds();
  const [organizations, modules, requests, subscriptions, modulePrices, pricingBundles] = await Promise.all([
    db.organization.findMany({ where: { id: { notIn: platformAnchorIds }, status: { in: ["ACTIVE", "TRIAL"] } }, orderBy: { name: "asc" } }),
    db.module.findMany({ where: { status: "ACTIVE", code: { in: [...catalogueModuleKeys] } }, orderBy: { name: "asc" } }),
    db.moduleRequest.findMany({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "QUOTED", "APPROVED"] } }, include: { organization: true, module: true, contactSubmission: true }, orderBy: { createdAt: "desc" } }),
    db.subscription.findMany({ include: { organization: true, module: true }, orderBy: { createdAt: "desc" } }),
    listModulePrices(),
    listPricingBundles(),
  ]);
  const modulePriceMap = new Map(modulePrices.map((price) => [price.moduleKey, price]));
  const usageByOrganization = new Map((await Promise.all(organizations.map(async (organization) => [organization.id, await getOrganizationSeatUsage(organization.id)] as const))));
  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" description="Create agreements, record payment, and control time-bounded module access." />
      {seats ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">User seat limit updated.</p> : null}
      {saved && SAVED_MESSAGES[saved] ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{SAVED_MESSAGES[saved]}</p> : null}
      {error && ERROR_MESSAGES[error] ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERROR_MESSAGES[error]}</p> : null}
      <Card>
        <CardHeader><CardTitle>New subscription</CardTitle><CardDescription>Manual/offline records a negotiated payment. Platform-managed marks subscriptions intended for automated renewal once a payment gateway is connected.</CardDescription></CardHeader>
        <CardContent>
          <form action={createSubscriptionAction} className="grid gap-4 md:grid-cols-3">
            <FieldSelect name="organizationId" label="Organization" items={organizations.map((x) => [x.id, x.name])} />
            <SubscriptionQuoteFields modules={modules.flatMap((module) => {
              const price = modulePriceMap.get(module.code as never);
              return price ? [{ id: module.id, name: module.name, moduleKey: module.code, monthlyGhs: price.monthlyGhs, annualGhs: price.annualGhs, includedSeats: price.includedSeats }] : [];
            })} />
            <FieldSelect name="mode" label="Billing mode" items={[["MANUAL_OFFLINE", "Manual / offline agreement"], ["PLATFORM_MANAGED", "Platform-managed billing"]]} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="unlimitedSeats" value="true" /> Unlimited seats</label>
            <div><Label htmlFor="currency">Currency</Label><Input id="currency" name="currency" defaultValue="GHS" maxLength={3} required /></div>
            <div className="md:col-span-3"><Label htmlFor="moduleRequestId">Related request</Label><select id="moduleRequestId" name="moduleRequestId" defaultValue="" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">No linked request</option>{requests.map((r) => <option key={r.id} value={r.id}>{r.organization.name} · {r.module?.name ?? r.title}</option>)}</select></div>
            <div className="md:col-span-3"><Label htmlFor="notes">Agreement notes</Label><Textarea id="notes" name="notes" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoRenew" value="true" /> Auto-renew (platform-managed)</label>
            <div className="md:col-span-3"><Button type="submit">Create pending subscription</Button></div>
          </form>
        </CardContent>
      </Card>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Subscription ledger</h2>
        {subscriptions.map((subscription) => (
          <Card key={subscription.id}>
            <CardHeader><div className="flex justify-between gap-3"><div><CardTitle>{subscription.organization.name} · {subscription.module.name}</CardTitle><CardDescription>{subscription.mode.replaceAll("_", " ").toLowerCase()} · {subscription.durationMonths} months · {subscription.currency} {subscription.amount.toString()}</CardDescription></div><Badge>{subscription.status}</Badge></div></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <form action={updateSubscriptionSeatLimitAction} className="flex items-end gap-2">
                  <input type="hidden" name="subscriptionId" value={subscription.id} />
                  <div><Label htmlFor={`seats-${subscription.id}`}>User seats</Label><Input id={`seats-${subscription.id}`} name="seatLimit" type="number" min="1" max="100000" defaultValue={subscription.seatLimit ?? 5} className="w-28" required /></div>
                  <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="unlimitedSeats" value="true" defaultChecked={subscription.seatLimit == null} />Unlimited</label>
                  <Button type="submit" size="sm" variant="outline">Update seats</Button>
                </form>
                <p className="pb-2 text-sm text-muted-foreground">Currently {usageByOrganization.get(subscription.organizationId)?.find((usage) => usage.moduleId === subscription.moduleId)?.used ?? 0} assigned</p>
              </div>
              {subscription.status === "PENDING_PAYMENT" ? (
                <form action={activateSubscriptionAction} className="grid gap-3 md:grid-cols-4">
                  <input type="hidden" name="subscriptionId" value={subscription.id} />
                  <Input name="paymentReference" placeholder="Payment reference" required />
                  <Input name="paymentMethod" placeholder="Bank, cash, mobile money…" required />
                  <Input name="startsAt" type="date" />
                  <Button type="submit">Confirm payment and activate</Button>
                </form>
              ) : <p className="text-sm text-muted-foreground">{subscription.startsAt?.toLocaleDateString() ?? "N/A"} → {subscription.endsAt?.toLocaleDateString() ?? "N/A"} {subscription.paymentReference ? `· ${subscription.paymentReference}` : ""}</p>}
              {!["CANCELLED", "EXPIRED"].includes(subscription.status) ? <form action={cancelSubscriptionAction}><input type="hidden" name="subscriptionId" value={subscription.id} /><Button type="submit" size="sm" variant="outline">Cancel subscription</Button></form> : null}
            </CardContent>
          </Card>
        ))}
      </section>

      <section id="pricing-catalogue" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Pricing catalogue</h2>
          <p className="text-muted-foreground">Prices shown on the public site, self-service checkout, and this page&apos;s quote form. Edits apply to new quotes and renewals only; existing subscriptions keep their stored amount.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {modulePrices.map((price) => (
            <Card key={price.moduleKey}>
              <CardHeader><CardTitle>{getModule(price.moduleKey)?.name ?? price.moduleKey}</CardTitle></CardHeader>
              <CardContent>
                <form action={updateModulePricePlan} className="grid grid-cols-2 gap-3">
                  <input type="hidden" name="moduleKey" value={price.moduleKey} />
                  <div><Label htmlFor={`${price.moduleKey}-monthly`}>Monthly (GHS)</Label><Input id={`${price.moduleKey}-monthly`} name="monthlyGhs" type="number" min="1" step="0.01" defaultValue={price.monthlyGhs} required /></div>
                  <div><Label htmlFor={`${price.moduleKey}-annual`}>Annual (GHS)</Label><Input id={`${price.moduleKey}-annual`} name="annualGhs" type="number" min="1" step="0.01" defaultValue={price.annualGhs} required /></div>
                  <div><Label htmlFor={`${price.moduleKey}-seats`}>Included seats</Label><Input id={`${price.moduleKey}-seats`} name="includedSeats" type="number" min="1" step="1" defaultValue={price.includedSeats} required /></div>
                  <div><Label htmlFor={`${price.moduleKey}-extra-seat`}>Extra seat (GHS/month)</Label><Input id={`${price.moduleKey}-extra-seat`} name="additionalSeatGhs" type="number" min="1" step="0.01" defaultValue={price.additionalSeatGhs} required /></div>
                  <div className="col-span-2"><Button type="submit" size="sm" variant="outline">Save price</Button></div>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {pricingBundles.map((bundle) => (
            <Card key={bundle.key}>
              <CardHeader><CardTitle>{bundle.name}</CardTitle><CardDescription>{bundle.modules.join(", ")}</CardDescription></CardHeader>
              <CardContent>
                <form action={updatePricingBundlePrice} className="grid grid-cols-2 gap-3">
                  <input type="hidden" name="bundleKey" value={bundle.key} />
                  <div><Label htmlFor={`${bundle.key}-name`}>Suite name</Label><Input id={`${bundle.key}-name`} name="name" defaultValue={bundle.name} maxLength={120} required /></div>
                  <div><Label htmlFor={`${bundle.key}-monthly`}>Monthly (GHS)</Label><Input id={`${bundle.key}-monthly`} name="monthlyGhs" type="number" min="1" step="0.01" defaultValue={bundle.monthlyGhs} required /></div>
                  <div className="col-span-2"><Button type="submit" size="sm" variant="outline">Save price</Button></div>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function FieldSelect({ name, label, items }: { name: string; label: string; items: [string, string][] }) {
  return <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required defaultValue="" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="" disabled>Select…</option>{items.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>;
}
