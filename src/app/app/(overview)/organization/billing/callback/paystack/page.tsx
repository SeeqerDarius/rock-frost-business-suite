import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { verifyTransaction } from "@/lib/payments";
import { activateSubscriptionFromGateway } from "@/platform/subscriptions/service";

/**
 * Where Paystack's hosted checkout returns the browser to. This is a UX
 * accelerant only — it verifies and activates immediately so the user
 * doesn't have to wait for the webhook (src/app/api/payments/paystack/webhook/route.ts),
 * which remains the authoritative confirmation path. Both converge on the
 * same idempotent activateSubscriptionFromGateway, so whichever lands first
 * wins and the other is a safe no-op.
 */
export default async function PaystackCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const tenant = await requireCurrentTenant();
  const { reference, trxref } = await searchParams;
  const ref = reference || trxref;

  let outcome: "success" | "failed" | "not-found" = "not-found";
  if (ref) {
    const subscription = await db.subscription.findFirst({
      where: { paymentReference: ref, gatewayProvider: "PAYSTACK", organizationId: tenant.organizationId },
    });
    if (subscription) {
      try {
        const verification = await verifyTransaction("PAYSTACK", ref);
        if (verification.success) {
          await activateSubscriptionFromGateway({
            reference: ref,
            provider: "PAYSTACK",
            verifiedAmount: verification.amount,
            verifiedCurrency: verification.currency,
          });
          outcome = "success";
        } else {
          outcome = "failed";
        }
      } catch (error) {
        console.error("[billing] Paystack callback verification failed:", error);
        outcome = "failed";
      }
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-12">
      <PageHeader title="Payment status" description="Paystack checkout result." />
      {outcome === "success" ? (
        <Alert>
          <AlertTitle>Payment confirmed</AlertTitle>
          <AlertDescription>Your module access has been activated.</AlertDescription>
        </Alert>
      ) : outcome === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Payment not confirmed</AlertTitle>
          <AlertDescription>
            We couldn&apos;t confirm this payment. If you were charged, it may still complete shortly — check back, or
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
