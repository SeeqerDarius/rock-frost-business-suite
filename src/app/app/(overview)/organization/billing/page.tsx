import { CreditCard, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { configuredGatewayProviders } from "@/lib/payments";
import { cancelPaystackRenewal, managePaystackSubscription, startGatewayPayment, startSelfServiceCheckout } from "./actions";
import { ModuleCart } from "./module-cart";
import { getOrganizationSeatUsage } from "@/platform/subscriptions/seats";
import { formatGhs, getModuleLadderMap, listModulePrices, listPricingBundles } from "@/lib/pricing";
import { PLAN_TIER_LABELS, PLAN_TIER_TAGLINES } from "@/platform/entitlements/tiers";
import { getModule } from "@/platform/modules/registry";
import { primaryProductKey } from "@/platform/modules/product-groups";

const ERRORS: Record<string, string> = {
  invalid: "That subscription could not be found.",
  "payment-failed": "We couldn't start that payment. Please try again shortly.",
  "manage-failed": "We couldn't open Paystack subscription management. Please try again shortly.",
  "cancel-failed": "We couldn't cancel automatic renewal. No billing change was made.",
  "invalid-selection": "Choose a valid module and billing period.",
  "already-subscribed": "One or more selected products already have an active or pending subscription. Refresh the page and try again.",
  "plan-unavailable": "Choose a plan that is available for that module.",
  "plan-required": "That module is sold by plan. Choose a plan on its own card below.",
};

const PROVIDER_LABELS: Record<string, string> = { PAYSTACK: "Paystack", FLUTTERWAVE: "Flutterwave" };

export default async function OrganizationBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; "renewal-cancelled"?: string; product?: string; type?: string }>;
}) {
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Billing" description="Module subscriptions and payment." />
        <EmptyState
          icon={Lock}
          title="You don't have access to this page"
          description="Billing is limited to roles with organization administration permissions."
        />
      </div>
    );
  }

  const { error, "renewal-cancelled": renewalCancelled, product, type } = await searchParams;
  const [subscriptions, seatUsage, modulePrices, pricingBundles] = await Promise.all([
    db.subscription.findMany({
      where: { organizationId: tenant.organizationId },
      include: { module: true, payments: { orderBy: { createdAt: "desc" }, take: 5 } },
      orderBy: { createdAt: "desc" },
    }),
    getOrganizationSeatUsage(tenant.organizationId),
    listModulePrices(),
    listPricingBundles(),
  ]);
  const availableProviders = configuredGatewayProviders();
  const subscribedProducts = new Set(subscriptions.flatMap((subscription) => subscription.entitledModuleKeys.length ? subscription.entitledModuleKeys.map(primaryProductKey) : [primaryProductKey(subscription.module.code)]));
  const selfServiceProducts = modulePrices.filter((price) => !subscribedProducts.has(price.moduleKey));
  // A module sold by plan is bought from its own card, not the cart: the cart
  // charges one price per module and has nowhere to choose a plan, so putting
  // a ladder module in it would hand over full access at the lowest rung's
  // price. The other modules have one price and no decision to make, so the
  // single-payment cart is still the better way to buy several at once.
  const ladderMap = await getModuleLadderMap();
  const cartProducts = selfServiceProducts.filter((price) => !ladderMap.has(price.moduleKey));
  const planProducts = selfServiceProducts.flatMap((price) => {
    const ladder = ladderMap.get(price.moduleKey);
    const module_ = getModule(price.moduleKey);
    return ladder && module_ ? [{ ladder, name: module_.name, description: module_.description }] : [];
  });
  const paystackAvailable = availableProviders.includes("PAYSTACK");

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Module subscriptions and payment for your organization." />
      {error && ERRORS[error] ? (
        <Alert variant="destructive">
          <AlertTitle>Payment could not be started</AlertTitle>
          <AlertDescription>{ERRORS[error]}</AlertDescription>
        </Alert>
      ) : null}
      {renewalCancelled ? (
        <Alert>
          <AlertTitle>Automatic renewal cancelled</AlertTitle>
          <AlertDescription>Your current access remains available until the displayed end date.</AlertDescription>
        </Alert>
      ) : null}

      {cartProducts.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Add modules</h2>
            <p className="text-sm text-muted-foreground">Check as many products as you need, then pay for all of them in a single payment. Access activates automatically after Paystack confirms payment.</p>
          </div>
          <ModuleCart
            products={cartProducts.flatMap((price) => {
              const module_ = getModule(price.moduleKey);
              return module_ ? [{ ...price, name: module_.name, description: module_.description }] : [];
            })}
            paystackAvailable={paystackAvailable}
          />
        </section>
      ) : null}

      {selfServiceProducts.length ? null : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Add modules</h2>
          <p className="rounded-md border p-4 text-sm text-muted-foreground">Every available product already has an active or pending subscription.</p>
        </section>
      )}

      {planProducts.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Choose a plan</h2>
            <p className="text-sm text-muted-foreground">These modules are sold by plan, so pick the one that matches how you work. You can move up a plan later and keep everything you have recorded.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {planProducts.map(({ ladder, name, description }) => (
              <Card key={ladder.moduleKey}>
                <CardHeader><CardTitle>{name}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
                <CardContent>
                  <form action={startSelfServiceCheckout} className="space-y-3">
                    <input type="hidden" name="productKey" value={ladder.moduleKey} />
                    <input type="hidden" name="productType" value="MODULE" />
                    <label className="block space-y-1 text-sm"><span className="font-medium">Plan</span><select name="tier" defaultValue={ladder.rungs.some((rung) => rung.tier === "PRO") ? "PRO" : ladder.rungs[0]?.tier} className="h-10 w-full rounded-md border bg-background px-3">{ladder.rungs.map((rung) => <option key={rung.tier} value={rung.tier}>{PLAN_TIER_LABELS[rung.tier]}, {formatGhs(rung.monthlyGhs)} monthly or {formatGhs(rung.annualGhs)} annually, {rung.includedSeats} seats</option>)}</select></label>
                    <ul className="space-y-1 text-xs text-muted-foreground">{ladder.rungs.map((rung) => <li key={rung.tier}><span className="font-medium text-foreground">{PLAN_TIER_LABELS[rung.tier]}:</span> {PLAN_TIER_TAGLINES[rung.tier]}</li>)}</ul>
                    <label className="block space-y-1 text-sm"><span className="font-medium">Billing period</span><select name="billingCycle" className="h-10 w-full rounded-md border bg-background px-3" defaultValue="ANNUAL"><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual, about two months saved</option></select></label>
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="autoRenew" value="true" defaultChecked className="mt-1 size-4" /><span>Renew automatically using the card authorized at checkout.</span></label>
                    <Button type="submit" disabled={!paystackAvailable}>Continue to secure payment</Button>
                  </form>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Subscribe to a combined suite</h2>
          <p className="text-sm text-muted-foreground">One payment activates every product listed in the suite.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {pricingBundles.map((bundle) => (
            <Card key={bundle.key} className={type === "bundle" && product === bundle.key ? "border-primary" : undefined}>
              <CardHeader><CardTitle>{bundle.name}</CardTitle><CardDescription>{bundle.modules.join(", ")}</CardDescription></CardHeader>
              <CardContent>
                <form action={startSelfServiceCheckout} className="space-y-3">
                  <input type="hidden" name="productKey" value={bundle.key} />
                  <input type="hidden" name="productType" value="BUNDLE" />
                  <label className="block space-y-1 text-sm"><span className="font-medium">Billing period</span><select name="billingCycle" className="h-10 w-full rounded-md border bg-background px-3" defaultValue="ANNUAL"><option value="MONTHLY">Monthly, {formatGhs(bundle.monthlyGhs)}</option><option value="ANNUAL">Annual, {formatGhs(bundle.monthlyGhs * 10)}</option></select></label>
                  <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="autoRenew" value="true" defaultChecked className="mt-1 size-4" /><span>Renew automatically using the card authorized at checkout.</span></label>
                  <Button type="submit" disabled={!paystackAvailable}>Continue to secure payment</Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {subscriptions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <CreditCard className="mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">No subscriptions yet</p>
            <p className="text-sm text-muted-foreground">
              Choose a module above to start a secure self-service checkout.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          {subscriptions.map((subscription) => {
            const awaitingPayment =
              (["DRAFT", "PENDING_PAYMENT", "PAST_DUE"] as string[]).includes(subscription.status) &&
              subscription.mode === "PLATFORM_MANAGED";
            return (
              <Card key={subscription.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{subscription.module.name}</CardTitle>
                      <CardDescription>
                        {subscription.durationMonths} months · {subscription.currency} {subscription.amount.toString()}
                        {subscription.mode === "MANUAL_OFFLINE" ? " · Arranged with Rock Frost" : " · Online payment"}
                      </CardDescription>
                    </div>
                    <Badge>{subscription.status.replaceAll("_", " ")}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {subscription.status === "ACTIVE" ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <p>Active until {subscription.endsAt?.toLocaleDateString() ?? "Not available"}</p>
                      <p>{(() => { const usage = seatUsage.find((entry) => entry.moduleId === subscription.moduleId); return usage?.limit == null ? `${usage?.used ?? 0} users · Unlimited seats` : `${usage.used} of ${usage.limit} user seats`; })()}</p>
                    </div>
                  ) : null}
                  {subscription.autoRenew && subscription.gatewayProvider === "PAYSTACK" ? (
                    <div className="space-y-2 rounded-md border p-3 text-sm">
                      <p className="font-medium">Automatic renewal is active</p>
                      <p className="text-muted-foreground">
                        Next Paystack attempt: {subscription.paystackNextPaymentAt?.toLocaleDateString() ?? "Awaiting Paystack schedule confirmation"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {subscription.paystackSubscriptionCode ? (
                          <form action={managePaystackSubscription}>
                            <input type="hidden" name="subscriptionId" value={subscription.id} />
                            <Button type="submit" variant="outline" size="sm">Manage payment card</Button>
                          </form>
                        ) : null}
                        {subscription.paystackSubscriptionCode && subscription.paystackEmailToken ? (
                          <form action={cancelPaystackRenewal}>
                            <input type="hidden" name="subscriptionId" value={subscription.id} />
                            <Button type="submit" variant="outline" size="sm">Cancel automatic renewal</Button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ) : subscription.gatewayProvider === "PAYSTACK" && subscription.paystackSubscriptionStatus === "non-renewing" ? (
                    <p className="text-sm text-muted-foreground">Automatic renewal is cancelled. Access continues until the current end date.</p>
                  ) : null}
                  {subscription.status === "PAST_DUE" ? (
                    <Alert variant="destructive">
                      <AlertTitle>Renewal payment failed</AlertTitle>
                      <AlertDescription>Module access is paused. Update your payment card or complete a new payment to restore access.</AlertDescription>
                    </Alert>
                  ) : null}
                  {awaitingPayment ? (
                    availableProviders.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Online payment isn&apos;t available right now. Contact Rock Frost to arrange payment.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {availableProviders.map((provider) => (
                          <form key={provider} action={startGatewayPayment}>
                            <input type="hidden" name="subscriptionId" value={subscription.id} />
                            <input type="hidden" name="provider" value={provider} />
                            <Button type="submit">Pay with {PROVIDER_LABELS[provider]}</Button>
                          </form>
                        ))}
                      </div>
                    )
                  ) : null}
                  {subscription.status === "PENDING_PAYMENT" && subscription.mode === "MANUAL_OFFLINE" ? (
                    <p className="text-sm text-muted-foreground">
                      Awaiting payment confirmation from your Rock Frost contact.
                    </p>
                  ) : null}
                  {subscription.payments.length ? (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">Recent online payments</p>
                      {subscription.payments.map((payment) => (
                        <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                          <span>{payment.createdAt.toLocaleDateString()} · {payment.currency} {payment.amount.toString()}</span>
                          <Badge variant={payment.status === "SUCCESS" ? "default" : "destructive"}>{payment.status}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
