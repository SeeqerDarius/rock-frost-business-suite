import { NextRequest, NextResponse } from "next/server";
import { verifyFlutterwaveWebhookHash, verifyTransaction } from "@/lib/payments";
import { activateSubscriptionFromGateway } from "@/platform/subscriptions/service";
import { logAuditEvent } from "@/lib/audit";

/**
 * The authoritative Flutterwave payment-confirmation path — configured as
 * the webhook URL in the Flutterwave dashboard, alongside the shared secret
 * string echoed back in `verif-hash` (FLUTTERWAVE_WEBHOOK_HASH). Always
 * returns 200 once the hash check passes, regardless of whether a matching
 * subscription/activation follows — Flutterwave retries non-200 responses.
 */
export async function POST(request: NextRequest) {
  const verifHash = request.headers.get("verif-hash");

  if (!verifyFlutterwaveWebhookHash(verifHash)) {
    await logAuditEvent({
      organizationId: null,
      module: "platform",
      action: "subscription.payment_failed",
      entityName: "Subscription",
      status: "FAILURE",
      metadata: { provider: "FLUTTERWAVE", reason: "invalid-hash" },
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const body = await request.json().catch(() => null) as { data?: { tx_ref?: string } } | null;
  const reference = body?.data?.tx_ref;

  if (reference) {
    try {
      // Never trust the webhook payload's own amount/status — verify
      // server-to-server against Flutterwave's API before activating anything.
      const verification = await verifyTransaction("FLUTTERWAVE", reference);
      if (verification.success) {
        await activateSubscriptionFromGateway({
          reference,
          provider: "FLUTTERWAVE",
          verifiedAmount: verification.amount,
          verifiedCurrency: verification.currency,
        });
      }
    } catch (error) {
      console.error("[webhook] Flutterwave activation failed:", error);
      await logAuditEvent({
        organizationId: null,
        module: "platform",
        action: "subscription.payment_failed",
        entityName: "Subscription",
        status: "FAILURE",
        metadata: { provider: "FLUTTERWAVE", reference, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
