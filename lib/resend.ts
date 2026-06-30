import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

interface SendEmailArgs {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, from, replyTo, subject, html, text }: SendEmailArgs) {
  const client = getResendClient();

  if (!client) {
    return { ok: false as const, error: "Email delivery is not configured yet." };
  }

  const response = await client.emails.send({
    from,
    to,
    replyTo,
    subject,
    html,
    text,
  });

  if (response.error) {
    return { ok: false as const, error: response.error.message };
  }

  return { ok: true as const, id: response.data?.id ?? null };
}
