"use server";

import { redirect } from "next/navigation";
import { sendEmail } from "@/lib/email";

const REASON_LABELS: Record<string, string> = {
  demo: "Request a demo",
  general: "General inquiry",
  support: "Existing customer support",
  other: "Something else",
};

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function submitContactForm(formData: FormData): Promise<void> {
  const name = clean(formData.get("name"));
  const company = clean(formData.get("company"));
  const email = clean(formData.get("email"));
  const reason = clean(formData.get("reason"));
  const message = clean(formData.get("message"));

  if (!name || !company || !email) {
    redirect("/contact?error=missing-fields");
  }

  const toAddress = process.env.RESEND_TO_EMAIL;
  if (!toAddress) {
    console.warn("[contact] RESEND_TO_EMAIL not configured — submission logged, not emailed:", {
      name,
      company,
      email,
      reason,
      message,
    });
    redirect("/contact?sent=1");
  }

  const result = await sendEmail({
    to: toAddress,
    subject: `New contact form submission: ${REASON_LABELS[reason] ?? reason}`,
    html: `
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Company:</strong> ${company}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Reason:</strong> ${REASON_LABELS[reason] ?? reason}</p>
      <p><strong>Message:</strong></p>
      <p>${message || "(no message provided)"}</p>
    `,
  });

  if (!result.ok) {
    redirect("/contact?error=send-failed");
  }

  redirect("/contact?sent=1");
}
