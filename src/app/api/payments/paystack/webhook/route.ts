import { NextRequest, NextResponse } from "next/server";
import { verifyPaystackSignature, verifyTransaction } from "@/lib/payments";
import {
  activateSubscriptionFromGateway,
  processPaystackRenewal,
  recordPaystackRenewalFailure,
  registerPaystackSubscription,
  updatePaystackSubscriptionState,
} from "@/platform/subscriptions/service";
import { logAuditEvent } from "@/lib/audit";
import { confirmOperationalPayment } from "@/lib/payments/operational";

function nestedRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function subscriptionCodeFrom(data: Record<string, unknown>) {
  const subscription = nestedRecord(data.subscription);
  return typeof subscription?.subscription_code === "string"
    ? subscription.subscription_code
    : typeof data.subscription_code === "string" ? data.subscription_code : null;
}

function planCodeFrom(data: Record<string, unknown>) {
  const plan = nestedRecord(data.plan);
  return typeof plan?.plan_code === "string"
    ? plan.plan_code
    : typeof data.plan_code === "string" ? data.plan_code
      : typeof data.plan === "string" ? data.plan : null;
}

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

  let event: { event?: string; data?: Record<string, unknown> } | null = null;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const data = event?.data ?? {};
  const reference = typeof data.reference === "string" ? data.reference : null;
  if (event?.event === "charge.success" && reference) {
    try {
      // Never trust the webhook payload's own amount/status — verify
      // server-to-server against Paystack's API before activating anything.
      const verification = await verifyTransaction("PAYSTACK", reference);
      if (verification.success) {
        if (reference.startsWith("op_")) {
          await confirmOperationalPayment({ reference, amount: verification.amount, currency: verification.currency, paidAt: verification.paidAt, channel: verification.channel, subaccountCode: verification.subaccountCode });
          return NextResponse.json({ received: true }, { status: 200 });
        }
        try {
          await activateSubscriptionFromGateway({
            reference,
            provider: "PAYSTACK",
            verifiedAmount: verification.amount,
            verifiedCurrency: verification.currency,
          });
        } catch (activationError) {
          const subscription = nestedRecord(data.subscription);
          const subscriptionCode = subscriptionCodeFrom(data);
          if (!subscriptionCode || !(activationError instanceof Error) || !activationError.message.includes("not found")) throw activationError;
          await processPaystackRenewal({
            subscriptionCode,
            reference,
            amount: verification.amount,
            currency: verification.currency,
            paidAt: typeof data.paid_at === "string" ? new Date(data.paid_at) : null,
            nextPaymentAt: typeof subscription?.next_payment_date === "string" ? new Date(subscription.next_payment_date) : null,
          });
        }
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

  if (event?.event === "subscription.create") {
    try {
      const customer = nestedRecord(data.customer);
      const planCode = planCodeFrom(data);
      const subscriptionCode = subscriptionCodeFrom(data);
      if (planCode && subscriptionCode) {
        await registerPaystackSubscription({
          planCode,
          subscriptionCode,
          emailToken: typeof data.email_token === "string" ? data.email_token : null,
          customerCode: typeof customer?.customer_code === "string" ? customer.customer_code : null,
          nextPaymentAt: typeof data.next_payment_date === "string" ? new Date(data.next_payment_date) : null,
          status: typeof data.status === "string" ? data.status : "active",
        });
      }
    } catch (error) {
      console.error("[webhook] Paystack subscription registration failed:", error);
    }
  }

  if (event?.event === "invoice.payment_failed") {
    try {
      const subscriptionCode = subscriptionCodeFrom(data);
      const invoiceCode = typeof data.invoice_code === "string" ? data.invoice_code : null;
      if (subscriptionCode && invoiceCode) {
        await recordPaystackRenewalFailure({
          subscriptionCode,
          reference: `invoice_${invoiceCode}`,
          invoiceCode,
          amount: (Number(data.amount ?? 0) / 100).toFixed(2),
          currency: String(data.currency ?? "GHS").toUpperCase(),
          reason: typeof data.description === "string" ? data.description : null,
        });
      }
    } catch (error) {
      console.error("[webhook] Paystack renewal failure processing failed:", error);
    }
  }

  if (event?.event === "subscription.not_renew" || event?.event === "subscription.disable") {
    try {
      const subscriptionCode = typeof data.subscription_code === "string" ? data.subscription_code : null;
      if (subscriptionCode) {
        await updatePaystackSubscriptionState({
          subscriptionCode,
          status: event.event === "subscription.not_renew" ? "non-renewing" : String(data.status ?? "cancelled"),
          nextPaymentAt: typeof data.next_payment_date === "string" ? new Date(data.next_payment_date) : null,
        });
      }
    } catch (error) {
      console.error("[webhook] Paystack subscription status processing failed:", error);
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
