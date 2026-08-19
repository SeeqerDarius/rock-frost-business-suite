"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { shortText, longText, email as emailSchema, parseWithSchema, escapeHtml } from "@/lib/validation";
import { isBotProtectionConfigured, verifyBotProtection } from "@/lib/bot-protection";
import { isContactHoneypotClear, verifyContactFormProof } from "@/lib/contact-form-protection";

const REASON_LABELS: Record<string, string> = {
  demo: "Request a demo",
  module: "Request a module",
  "custom-module": "Request a custom module",
  general: "General inquiry",
  support: "Existing customer support",
  legal: "Legal or privacy inquiry",
  other: "Something else",
};

const RESUBMIT_COOLDOWN_MS = 60 * 1000;

const contactFormSchema = z.object({
  name: shortText,
  company: shortText,
  email: emailSchema,
  phone: z.string().trim().max(40).optional().default(""),
  preferredContact: z.enum(["EMAIL", "PHONE", "WHATSAPP"]),
  intent: z.enum(["DEMO", "MODULE", "GENERAL", "SUPPORT", "CUSTOM_MODULE", "LEGAL"]),
  moduleCode: z.string().trim().max(50).optional().default(""),
  expectedUsers: z.coerce.number().int().positive().max(100000).optional(),
  country: z.string().trim().max(100).optional().default(""),
  industry: z.string().trim().max(150).optional().default(""),
  reason: z.string().trim().default("other"),
  message: longText.optional().default(""),
}).superRefine((data, ctx) => {
  if ((data.preferredContact === "PHONE" || data.preferredContact === "WHATSAPP") && !data.phone) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: "A phone number is required for phone or WhatsApp contact." });
  }
  if ((data.intent === "DEMO" || data.intent === "MODULE") && !data.moduleCode) {
    ctx.addIssue({ code: "custom", path: ["moduleCode"], message: "Choose a module." });
  }
});

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function submitContactForm(formData: FormData): Promise<void> {
  const turnstileConfigured = isBotProtectionConfigured();
  const botVerified = turnstileConfigured
    ? await verifyBotProtection(formData.get("cf-turnstile-response"), "contact")
    : verifyContactFormProof(formData.get("contactProof"), process.env.NEXTAUTH_SECRET ?? "")
      && isContactHoneypotClear(formData.get("website"));

  if (!botVerified) {
    console.warn("[contact] Submission verification failed", {
      mode: turnstileConfigured ? "turnstile" : "signed-fallback",
      hasTurnstileToken: Boolean(clean(formData.get("cf-turnstile-response"))),
      honeypotFilled: !isContactHoneypotClear(formData.get("website")),
    });
    redirect("/contact?error=bot-check");
  }
  const parsed = parseWithSchema(contactFormSchema, {
    name: clean(formData.get("name")),
    company: clean(formData.get("company")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    preferredContact: clean(formData.get("preferredContact")) || "EMAIL",
    intent: clean(formData.get("intent")) || "GENERAL",
    moduleCode: clean(formData.get("moduleCode")),
    expectedUsers: clean(formData.get("expectedUsers")) || undefined,
    country: clean(formData.get("country")),
    industry: clean(formData.get("industry")),
    reason: clean(formData.get("reason")),
    message: clean(formData.get("message")),
  });

  if (!parsed.success) {
    redirect("/contact?error=missing-fields");
  }

  const { name, company, email, phone, preferredContact, intent, moduleCode, expectedUsers, country, industry, message } = parsed.data;
  const reason = intent === "DEMO" ? "demo"
    : intent === "MODULE" ? "module"
    : intent === "CUSTOM_MODULE" ? "custom-module"
    : intent === "SUPPORT" ? "support"
    : intent === "LEGAL" ? "legal"
    : "general";

  // Basic rate limit: reject a second submission from the same email within
  // the cooldown window, rather than silently emailing/forwarding every one.
  const recent = await db.contactSubmission.findFirst({
    where: { email, createdAt: { gte: new Date(Date.now() - RESUBMIT_COOLDOWN_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    redirect("/contact?error=too-soon");
  }

  const module_ = moduleCode
    ? await db.module.findFirst({ where: { code: moduleCode, status: "ACTIVE" } })
    : null;
  if (moduleCode && !module_) redirect("/contact?error=invalid-module");

  const submission = await db.contactSubmission.create({
    data: {
      name,
      company,
      email,
      phone: phone || null,
      preferredContact,
      intent,
      reason,
      moduleId: module_?.id ?? null,
      expectedUsers: expectedUsers ?? null,
      country: country || null,
      industry: industry || null,
      message: message || null,
    },
  });

  const operators = await db.organizationMember.findMany({
    where: {
      status: "ACTIVE",
      role: { name: "Super Admin", isSystem: true, organizationId: null },
      user: { status: "ACTIVE" },
    },
    select: { organizationId: true, userId: true },
  });
  if (operators.length) {
    await db.notification.createMany({
      data: operators.map((operator) => ({
        organizationId: operator.organizationId,
        userId: operator.userId,
        type: "PUBLIC_MODULE_ENQUIRY",
        title: `${intent === "DEMO" ? "Demo" : intent === "LEGAL" ? "Legal or privacy" : "Module"} request: ${module_?.name ?? company}`,
        message: `${name} from ${company} prefers ${preferredContact.toLowerCase()} contact.`,
        status: "QUEUED" as const,
        metadata: { contactSubmissionId: submission.id, moduleCode: moduleCode || null, intent },
      })),
      skipDuplicates: true,
    });
  }

  const toAddress = process.env.RESEND_TO_EMAIL;
  if (!toAddress) {
    console.warn("[contact] RESEND_TO_EMAIL not configured, submission persisted but not emailed:", { name, company, email, reason });
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
      <p><strong>Phone:</strong> ${phone ? escapeHtml(phone) : "(not supplied)"}</p>
      <p><strong>Preferred contact:</strong> ${escapeHtml(preferredContact)}</p>
      <p><strong>Module:</strong> ${escapeHtml(module_?.name ?? "Not selected")}</p>
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
