import Link from "next/link";
import { CalendarDays, CheckCircle2, CreditCard, ReceiptText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { verifyTransaction } from "@/lib/payments";
import { activateSubscriptionFromGateway, resetAbandonedCheckout } from "@/platform/subscriptions/service";
import { getModule } from "@/platform/modules/registry";

type PaymentDetails = {
  moduleName: string;
  moduleCode: string;
  amount: string;
  currency: string;
  reference: string;
  paidAt: Date;
  endsAt: Date | null;
  durationMonths: number;
  autoRenew: boolean;
  nextPaymentAt: Date | null;
};

export default async function PaystackCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const tenant = await requireCurrentTenant();
  const { reference, trxref } = await searchParams;
  const ref = reference || trxref;

  let outcome: "success" | "failed" | "not-found" = "not-found";
  let details: PaymentDetails | null = null;
  if (ref) {
    const pending = await db.subscription.findFirst({
      where: { paymentReference: ref, gatewayProvider: "PAYSTACK", organizationId: tenant.organizationId },
      select: { id: true },
    });
    if (pending) {
      try {
        const verification = await verifyTransaction("PAYSTACK", ref);
        if (verification.success) {
          await activateSubscriptionFromGateway({
            reference: ref,
            provider: "PAYSTACK",
            verifiedAmount: verification.amount,
            verifiedCurrency: verification.currency,
          });
          const confirmed = await db.subscription.findFirst({
            where: { id: pending.id, organizationId: tenant.organizationId },
            include: {
              module: { select: { name: true, code: true } },
              payments: { where: { gatewayProvider: "PAYSTACK", paymentReference: ref }, take: 1 },
            },
          });
          const payment = confirmed?.payments[0];
          if (confirmed && payment) {
            details = {
              moduleName: confirmed.module.name,
              moduleCode: confirmed.module.code,
              amount: payment.amount.toFixed(2),
              currency: payment.currency,
              reference: payment.paymentReference,
              paidAt: payment.paidAt ?? payment.createdAt,
              endsAt: confirmed.endsAt,
              durationMonths: confirmed.durationMonths,
              autoRenew: confirmed.autoRenew,
              nextPaymentAt: confirmed.paystackNextPaymentAt,
            };
            outcome = "success";
          } else {
            outcome = "failed";
          }
        } else {
          // A definitive non-success verification (the customer cancelled at
          // Paystack, or the card was declined) - reset the never-paid
          // attempt so it doesn't linger as "pending payment" and block a
          // retry. A thrown verification error below is left alone since the
          // payment might still complete and the webhook should catch it up.
          await resetAbandonedCheckout(pending.id, tenant.organizationId);
          outcome = "failed";
        }
      } catch (error) {
        console.error("[billing] Paystack callback verification failed:", error);
        outcome = "failed";
      }
    }
  }

  if (outcome === "success" && details) {
    const route = getModule(details.moduleCode)?.routePrefix ?? "/app/dashboard";
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8 sm:py-12">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="size-9" aria-hidden="true" />
          </span>
          <Badge variant="outline">Payment confirmed</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Thank you for your payment</h1>
          <p className="text-muted-foreground">{details.moduleName} is active and ready for your organization.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-5" />Payment summary</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Product</p><p className="font-medium">{details.moduleName}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Amount paid</p><p className="font-medium">{details.currency} {details.amount}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Payment date</p><p className="font-medium">{details.paidAt.toLocaleDateString()}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Access period</p><p className="font-medium">{details.durationMonths} {details.durationMonths === 1 ? "month" : "months"}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Active until</p><p className="font-medium">{details.endsAt?.toLocaleDateString() ?? "Being scheduled"}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Renewal</p><p className="font-medium">{details.autoRenew ? "Automatic renewal enabled" : "Manual renewal"}</p></div>
            <div className="sm:col-span-2"><p className="text-xs uppercase tracking-wide text-muted-foreground">Payment reference</p><p className="break-all font-mono text-sm">{details.reference}</p></div>
          </CardContent>
        </Card>

        {details.autoRenew ? (
          <Alert>
            <CalendarDays className="size-4" />
            <AlertTitle>Automatic renewal is active</AlertTitle>
            <AlertDescription>
              {details.nextPaymentAt ? `The next Paystack payment is scheduled for ${details.nextPaymentAt.toLocaleDateString()}.` : "Paystack is confirming the next payment date. It will appear in Billing shortly."}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button nativeButton={false} render={<Link href={route} />}>Open {details.moduleName}</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/app/organization/billing" />}>View billing and receipt</Button>
        </div>
        <p className="text-center text-xs text-muted-foreground"><CreditCard className="mr-1 inline size-3" />Payment was securely processed by Paystack.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-12">
      <h1 className="text-2xl font-semibold">Payment status</h1>
      {outcome === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Payment not confirmed</AlertTitle>
          <AlertDescription>We couldn&apos;t confirm this payment yet. If you were charged, Paystack may still complete it shortly. Check Billing before trying again.</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t find this payment</AlertTitle>
          <AlertDescription>Return to Billing and try again, or contact Rock Frost support.</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button nativeButton={false} render={<Link href="/app/organization/billing" />}>Return to billing</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/app/support" />}>Contact support</Button>
      </div>
    </div>
  );
}
