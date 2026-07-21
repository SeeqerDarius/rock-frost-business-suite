"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { shortText, longText, email as emailSchema, parseWithSchema, escapeHtml } from "@/lib/validation";

const REASON_LABELS: Record<string, string> = {
  demo: "Request a demo",
  general: "General inquiry",
  support: "Existing customer support",
  other: "Something else",
};

const RESUBMIT_COOLDOWN_MS = 60 * 1000;

const contactFormSchema = z.object({
  name: shortText,
  company: shortText,
  email: emailSchema,
  reason: z.string().trim().default("other"),
  message: longText.optional().default(""),
});

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function submitContactForm(formData: FormData): Promise<void> {
  const parsed = parseWithSchema(contactFormSchema, {
    name: clean(formData.get("name")),
    company: clean(formData.get("company")),
    email: clean(formData.get("email")),
    reason: clean(formData.get("reason")),
    message: clean(formData.get("message")),
  });

  if (!parsed.success) {
    redirect("/contact?error=missing-fields");
  }

  const { name, company, email, reason, message } = parsed.data;

  // Basic rate limit: reject a second submission from the same email within
  // the cooldown window, rather than silently emailing/forwarding every one.
  const recent = await db.contactSubmission.findFirst({
    where: { email, createdAt: { gte: new Date(Date.now() - RESUBMIT_COOLDOWN_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    redirect("/contact?error=too-soon");
  }

  await db.contactSubmission.create({ data: { name, company, email, reason, message: message || null } });

  const toAddress = process.env.RESEND_TO_EMAIL;
  if (!toAddress) {
    console.warn("[contact] RESEND_TO_EMAIL not configured — submission persisted, not emailed:", { name, company, email, reason });
    redirect("/contact?sent=1");
  }

  const reasonLabel = REASON_LABELS[reason] ?? reason;

  const result = await sendEmail({
    to: toAddress,
    subject: `New contact form submission: ${escapeHtml(reasonLabel)}`,
    html: `
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Company:</strong> ${escapeHtml(company)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Reason:</strong> ${escapeHtml(reasonLabel)}</p>
      <p><strong>Message:</strong></p>
      <p>${message ? escapeHtml(message) : "(no message provided)"}</p>
    `,
  });

  if (!result.ok) {
    redirect("/contact?error=send-failed");
  }

  redirect("/contact?sent=1");
}
