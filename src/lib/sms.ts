import "server-only";

import { db } from "@/lib/db";
import { normalizeGhanaPhone } from "@/lib/phone";
import { canSendModuleSms } from "@/lib/platform-communications";

/**
 * mNotify's Quick Bulk SMS endpoint (confirmed against the current API docs
 * at https://developer.bms.africa): the API key is a query parameter, not a
 * header or body field, and the recipient number must already be in local
 * Ghana format ("0XXXXXXXXX") - see src/lib/phone.ts.
 */
const MNOTIFY_QUICK_SMS_URL = "https://api.mnotify.com/api/sms/quick";

interface MnotifyQuickSmsResponse {
  status: string;
  code?: string;
  message?: string;
  summary?: {
    _id?: string;
    total_sent?: number;
    total_rejected?: number;
    credit_used?: number;
    credit_left?: number;
  };
}

export interface SendSmsResult {
  ok: boolean;
  error?: string;
}

export interface SendSmsArgs {
  to: string;
  body: string;
  /** A short machine-readable purpose code, e.g. "PHARMACY_PICKUP_READY", "2FA_LOGIN" - stored on the SmsMessage log and used by callers like the appointment-reminder cron to dedup ("has a reminder already gone out for this record"). */
  purpose: string;
  organizationId: string;
  /**
   * Which module is sending. Required, because entitlement is per module:
   * an organization on School Pro may text guardians while the same
   * organization's Hotel may not. Without this the gate could only ask "may
   * this customer send SMS at all", which is exactly the coarseness that made
   * one boolean silently cover five modules. Omitted only for `isOtp` sends,
   * which belong to authentication rather than any module.
   */
  moduleKey?: string;
  /** Pairs with relatedId to let a caller look up "was an SMS with this purpose already sent for this record" via the SmsMessage log, without adding a column to that record's own model. */
  relatedType?: string;
  relatedId?: string;
  /**
   * mNotify charges an extra fee per OTP-purpose campaign and explicitly
   * warns not to set this for anything else: "Do not include the sms_otp
   * field in the payload unless the message blast is specifically for OTP
   * purposes." Only 2FA code sends should pass true.
   */
  isOtp?: boolean;
}

/** Returns false if MNOTIFY_API_KEY/MNOTIFY_SENDER_ID are unset, so callers can degrade gracefully instead of crashing. */
export function isSmsConfigured(): boolean {
  return Boolean(process.env.MNOTIFY_API_KEY && process.env.MNOTIFY_SENDER_ID);
}

export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  const apiKey = process.env.MNOTIFY_API_KEY;
  const senderId = process.env.MNOTIFY_SENDER_ID;
  const to = normalizeGhanaPhone(args.to);

  if (!apiKey || !senderId) {
    console.warn(`[sms] Not configured, would have sent "${args.purpose}" to ${args.to}`);
    return { ok: false, error: "SMS delivery is not configured yet." };
  }

  // Entitlement is per module and per organization (see canSendModuleSms in
  // platform-communications.ts for the override-then-tier order). It never
  // applies to 2FA OTP codes: login must keep working for an organization
  // that has not bought SMS notifications for anything.
  if (!args.isOtp) {
    if (!args.moduleKey) {
      // Fail closed rather than fall back to an organization-wide check. A
      // caller that forgot its module key is a bug, and guessing would
      // reintroduce exactly the cross-module leak this replaced.
      console.error(`[sms] Refusing to send "${args.purpose}" for organization ${args.organizationId}: no moduleKey supplied.`);
      return { ok: false, error: "SMS notifications are not enabled for this organization." };
    }
    if (!(await canSendModuleSms(args.organizationId, args.moduleKey))) {
      console.warn(`[sms] Organization ${args.organizationId} is not entitled to SMS notifications for the ${args.moduleKey} module, would have sent "${args.purpose}" to ${args.to}`);
      return { ok: false, error: "SMS notifications are not enabled for this organization." };
    }
  }

  if (!to) {
    console.warn(`[sms] Invalid recipient phone number for purpose "${args.purpose}": ${args.to}`);
    return { ok: false, error: "Invalid recipient phone number." };
  }

  try {
    const response = await fetch(`${MNOTIFY_QUICK_SMS_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: [to],
        sender: senderId,
        message: args.body,
        is_schedule: false,
        schedule_date: "",
        ...(args.isOtp ? { sms_type: "otp" } : {}),
      }),
    });
    const data = (await response.json()) as MnotifyQuickSmsResponse;
    const ok = response.ok && data.status === "success";

    await db.smsMessage.create({
      data: {
        organizationId: args.organizationId,
        to,
        body: args.body,
        purpose: args.purpose,
        relatedType: args.relatedType,
        relatedId: args.relatedId,
        status: ok ? "SENT" : "FAILED",
        providerResponse: data as object,
        error: ok ? undefined : (data.message ?? "mNotify rejected the message."),
      },
    });

    return ok ? { ok: true } : { ok: false, error: data.message ?? "Failed to send SMS." };
  } catch (error) {
    console.error("[sms] Send failed:", error);
    await db.smsMessage.create({
      data: {
        organizationId: args.organizationId,
        to,
        body: args.body,
        purpose: args.purpose,
        relatedType: args.relatedType,
        relatedId: args.relatedId,
        status: "FAILED",
        error: "Failed to send SMS.",
      },
    });
    return { ok: false, error: "Failed to send SMS." };
  }
}
