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
import { startGatewayPayment } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "That subscription could not be found.",
  "payment-failed": "We couldn't start that payment. Please try again shortly.",
};

const PROVIDER_LABELS: Record<string, string> = { PAYSTACK: "Paystack", FLUTTERWAVE: "Flutterwave" };

export default async function OrganizationBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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

  const { error } = await searchParams;
  const subscriptions = await db.subscription.findMany({
    where: { organizationId: tenant.organizationId },
    include: { module: true },
    orderBy: { createdAt: "desc" },
  });
  const availableProviders = configuredGatewayProviders();

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Module subscriptions and payment for your organization." />
      {error && ERRORS[error] ? (
        <Alert variant="destructive">
          <AlertTitle>Payment could not be started</AlertTitle>
          <AlertDescription>{ERRORS[error]}</AlertDescription>
        </Alert>
      ) : null}

      {subscriptions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <CreditCard className="mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">No subscriptions yet</p>
            <p className="text-sm text-muted-foreground">
              Module subscriptions arranged with your Rock Frost contact will appear here.
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
                    <p className="text-sm text-muted-foreground">
                      Active until {subscription.endsAt?.toLocaleDateString() ?? "—"}
                    </p>
                  ) : null}
                  {awaitingPayment ? (
                    availableProviders.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Online payment isn&apos;t available right now — contact Rock Frost to arrange payment.
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
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
