import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { verifyTransaction } from "@/lib/payments";
import { activateSubscriptionFromGateway } from "@/platform/subscriptions/service";

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

  let outcome: "success" | "failed" | "not-found" = "not-found";
  if (ref && status !== "cancelled") {
    const subscription = await db.subscription.findFirst({
      where: { paymentReference: ref, gatewayProvider: "FLUTTERWAVE", organizationId: tenant.organizationId },
    });
    if (subscription) {
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
          outcome = "failed";
        }
      } catch (error) {
        console.error("[billing] Flutterwave callback verification failed:", error);
        outcome = "failed";
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
