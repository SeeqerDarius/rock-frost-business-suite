import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { verifyTransaction } from "@/lib/payments";
import { activateSubscriptionFromGateway, resetAbandonedCheckout } from "@/platform/subscriptions/service";

/**
 * Where Flutterwave's hosted checkout returns the browser to. Same
 * UX-accelerant role as the Paystack callback (see that page's comment) —
 * the webhook (src/app/api/payments/flutterwave/webhook/route.ts) is the
 * authoritative path; both converge on the same idempotent
 * activateSubscriptionFromGateway.
 */
export default async function FlutterwaveCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ tx_ref?: string; status?: string }>;
}) {
  const tenant = await requireCurrentTenant();
  const { tx_ref: ref, status } = await searchParams;

  let outcome: "success" | "failed" | "cancelled" | "not-found" = "not-found";
  if (ref) {
    const subscription = await db.subscription.findFirst({
      where: { paymentReference: ref, gatewayProvider: "FLUTTERWAVE", organizationId: tenant.organizationId },
    });
    if (subscription) {
      if (status === "cancelled") {
        // The customer cancelled at Flutterwave's checkout page - Flutterwave
        // reports this directly via the status param, no verification call
        // needed. Reset the never-paid attempt so it doesn't linger as
        // "pending payment" and block a retry.
        await resetAbandonedCheckout(subscription.id, tenant.organizationId);
        outcome = "cancelled";
      } else {
        try {
          const verification = await verifyTransaction("FLUTTERWAVE", ref);
          if (verification.success) {
            await activateSubscriptionFromGateway({
              reference: ref,
              provider: "FLUTTERWAVE",
              verifiedAmount: verification.amount,
              verifiedCurrency: verification.currency,
            });
            outcome = "success";
          } else {
            // A definitive failed transaction (e.g. card declined) - reset the
            // never-paid attempt. A thrown verification error below is left
            // alone since the payment might still complete and the webhook
            // should catch it up.
            await resetAbandonedCheckout(subscription.id, tenant.organizationId);
            outcome = "failed";
          }
        } catch (error) {
          console.error("[billing] Flutterwave callback verification failed:", error);
          outcome = "failed";
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-12">
      <PageHeader title="Payment status" description="Flutterwave checkout result." />
      {outcome === "success" ? (
        <Alert>
          <AlertTitle>Payment confirmed</AlertTitle>
          <AlertDescription>Your module access has been activated.</AlertDescription>
        </Alert>
      ) : outcome === "cancelled" ? (
        <Alert>
          <AlertTitle>Checkout cancelled</AlertTitle>
          <AlertDescription>No charge was made. You can try again anytime from Billing.</AlertDescription>
        </Alert>
      ) : outcome === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Payment not confirmed</AlertTitle>
          <AlertDescription>
            We couldn&apos;t confirm this payment. If you were charged, it may still complete shortly. Check back, or
            contact Rock Frost support.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t find this payment</AlertTitle>
          <AlertDescription>Return to billing and try again, or contact Rock Frost support.</AlertDescription>
        </Alert>
      )}
      <Button nativeButton={false} render={<Link href="/app/organization/billing" />}>
        Back to billing
      </Button>
    </div>
  );
}
