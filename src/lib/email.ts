import "server-only";

import { Resend } from "resend";

let client: Resend | null | undefined;

/** Returns null if RESEND_API_KEY is unset, so callers can degrade gracefully instead of crashing. */
export function getResendClient(): Resend | null {
  if (client !== undefined) return client;
  client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  return client;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail(args: { to: string; subject: string; html: string; text?: string }): Promise<SendEmailResult> {
  const resend = getResendClient();
  const from = process.env.RESEND_FROM_EMAIL;

  if (!resend || !from) {
    console.warn(`[email] Not configured, would have sent "${args.subject}" to ${args.to}`);
    return { ok: false, error: "Email delivery is not configured yet." };
  }

  try {
    await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: process.env.RESEND_REPLY_TO || undefined,
    });
    return { ok: true };
  } catch (error) {
    console.error("[email] Send failed:", error);
    return { ok: false, error: "Failed to send email." };
  }
}
