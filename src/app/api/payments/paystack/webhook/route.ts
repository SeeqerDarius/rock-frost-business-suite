import { NextRequest, NextResponse } from "next/server";
import { verifyPaystackSignature, verifyTransaction } from "@/lib/payments";
import { activateSubscriptionFromGateway } from "@/platform/subscriptions/service";
import { logAuditEvent } from "@/lib/audit";

/**
 * The authoritative Paystack payment-confirmation path — configured as the
 * webhook URL in the Paystack dashboard. Signature verification runs against
 * the raw request body (never a re-serialized JSON.stringify of the parsed
 * payload). Always returns 200: Paystack retries non-200 responses, and a
 * rejected/already-processed event should not trigger a retry storm.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    await logAuditEvent({
      organizationId: null,
      module: "platform",
      action: "subscription.payment_failed",
      entityName: "Subscription",
      status: "FAILURE",
      metadata: { provider: "PAYSTACK", reason: "invalid-signature" },
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let event: { event?: string; data?: { reference?: string } } | null = null;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const reference = event?.data?.reference;
  if (event?.event === "charge.success" && reference) {
    try {
      // Never trust the webhook payload's own amount/status — verify
      // server-to-server against Paystack's API before activating anything.
      const verification = await verifyTransaction("PAYSTACK", reference);
      if (verification.success) {
        await activateSubscriptionFromGateway({
          reference,
          provider: "PAYSTACK",
          verifiedAmount: verification.amount,
          verifiedCurrency: verification.currency,
        });
      }
    } catch (error) {
      console.error("[webhook] Paystack activation failed:", error);
      await logAuditEvent({
        organizationId: null,
        module: "platform",
        action: "subscription.payment_failed",
        entityName: "Subscription",
        status: "FAILURE",
        metadata: { provider: "PAYSTACK", reference, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
