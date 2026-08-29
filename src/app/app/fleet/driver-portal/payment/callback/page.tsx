import Link from "next/link";
import { CheckCircle2, Clock3, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { verifyTransaction } from "@/lib/payments";
import { confirmOperationalPayment, getOperationalPaymentForTenant } from "@/lib/payments/operational";

export default async function FleetPaymentCallbackPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const tenant = await requireModuleAccess("fleet");
  const params = await searchParams;
  const reference = params.reference ?? params.trxref ?? "";
  let payment = reference ? await getOperationalPaymentForTenant(tenant.organizationId, reference) : null;
  if (payment && payment.status !== "SUCCESS") {
    try {
      const verified = await verifyTransaction("PAYSTACK", reference);
      if (verified.success) {
        await confirmOperationalPayment({ reference, amount: verified.amount, currency: verified.currency, paidAt: verified.paidAt, channel: verified.channel, subaccountCode: verified.subaccountCode });
        payment = await getOperationalPaymentForTenant(tenant.organizationId, reference);
      }
    } catch (error) {
      console.error("[fleet] Paystack callback verification failed", error);
    }
  }
  const confirmed = payment?.status === "SUCCESS";
  return <div className="mx-auto max-w-xl py-10"><Card><CardHeader className="text-center">{confirmed ? <CheckCircle2 className="mx-auto size-12 text-emerald-600" /> : <Clock3 className="mx-auto size-12 text-amber-600" />}<CardTitle>{confirmed ? "Payment confirmed" : "Payment confirmation pending"}</CardTitle></CardHeader><CardContent className="space-y-4 text-center">{payment ? <><p className="text-3xl font-semibold">{payment.currency} {Number(payment.amount).toFixed(2)}</p><p className="text-sm text-muted-foreground">{confirmed ? `Collected on behalf of ${tenant.organization.name}.` : "Paystack may still be confirming the transaction. Do not pay again until you check your Driver workspace."}</p>{payment.receiptNumber ? <div className="rounded-lg border p-4 text-left text-sm"><p className="flex items-center gap-2 font-medium"><ReceiptText className="size-4" />Receipt</p><p className="mt-2">Receipt number: {payment.receiptNumber}</p><p>Payment reference: {payment.providerReference}</p><p>Status: {payment.status}</p></div> : null}</> : <p>We could not match this return to a payment in your organization.</p>}<Button nativeButton={false} render={<Link href="/app/fleet/driver-portal" />}>Return to Driver workspace</Button></CardContent></Card></div>;
}
