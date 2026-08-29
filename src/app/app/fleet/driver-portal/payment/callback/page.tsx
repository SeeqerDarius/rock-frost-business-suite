import Link from "next/link";
import { CheckCircle2, Clock3, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { verifyTransaction } from "@/lib/payments";
import { confirmOperationalPayment, getOperationalPaymentForTenant } from "@/lib/payments/operational";
import { db } from "@/lib/db";

const PURPOSE_LABELS: Record<string, string> = {
  FLEET_REMITTANCE: "Vehicle remittance",
  FLEET_WORK_AND_PAY: "Work & Pay instalment",
};

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
  const submission = payment
    ? await db.fleetDriverPaymentSubmission.findFirst({
        where: { id: payment.sourceId, organizationId: tenant.organizationId },
        select: { periodStart: true, periodEnd: true, vehicle: { select: { plateNumber: true } } },
      })
    : null;
  const confirmed = payment?.status === "SUCCESS";
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <CardHeader className="text-center">
          {confirmed ? <CheckCircle2 className="mx-auto size-12 text-emerald-600" /> : <Clock3 className="mx-auto size-12 text-amber-600" />}
          <CardTitle>{confirmed ? "Payment confirmed" : "Payment confirmation pending"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {payment ? (
            <>
              <p className="text-3xl font-semibold">{payment.currency} {Number(payment.amount).toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">{confirmed ? `Collected on behalf of ${tenant.organization.name}.` : "Paystack may still be confirming the transaction. Do not pay again until you check your Driver workspace."}</p>
              <div className="rounded-lg border p-4 text-left text-sm">
                <p className="flex items-center gap-2 font-medium"><ReceiptText className="size-4" aria-hidden="true" />Receipt</p>
                <dl className="mt-2 space-y-1">
                  {submission?.vehicle ? <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Vehicle</dt><dd>{submission.vehicle.plateNumber}</dd></div> : null}
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">For</dt><dd>{PURPOSE_LABELS[payment.purpose] ?? payment.purpose}</dd></div>
                  {submission ? <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Period</dt><dd>{submission.periodStart.toLocaleDateString()}{submission.periodEnd.getTime() !== submission.periodStart.getTime() ? ` - ${submission.periodEnd.toLocaleDateString()}` : ""}</dd></div> : null}
                  {payment.receiptNumber ? <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Receipt number</dt><dd>{payment.receiptNumber}</dd></div> : null}
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Reference</dt><dd className="break-all">{payment.providerReference}</dd></div>
                  {payment.paidAt ? <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Date</dt><dd>{payment.paidAt.toLocaleString()}</dd></div> : null}
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Status</dt><dd>{confirmed ? "Confirmed" : "Pending confirmation"}</dd></div>
                </dl>
              </div>
            </>
          ) : (
            <p>We could not match this return to a payment in your organization.</p>
          )}
          <Button nativeButton={false} render={<Link href="/app/fleet/driver-portal?tab=activity" />}>Return to Driver workspace</Button>
        </CardContent>
      </Card>
    </div>
  );
}
