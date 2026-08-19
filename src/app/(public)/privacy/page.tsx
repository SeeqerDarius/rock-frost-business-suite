import Link from "next/link";
import { createPublicMetadata } from "@/lib/seo";

export const metadata = createPublicMetadata({
  title: "Privacy Policy",
  description: "How Rock Frost Technologies collects, uses, and protects personal data across our website and Rock Frost Business Suite.",
  path: "/privacy",
  keywords: ["Rock Frost privacy policy", "Rock Frost Business Suite data protection"],
});

const EFFECTIVE_DATE = "19 August 2026";

const sections = [
  {
    title: "1. Who this policy covers, and two different roles",
    body: [
      "This policy explains how Rock Frost Technologies (\"Rock Frost\", \"we\", \"us\"), a technology company operating in Ghana, handles personal data across the rockfrostgroup.com website and Rock Frost Business Suite.",
      "Rock Frost holds two different roles depending on whose data is involved. For visitors to our website and for the account holders (your organization's staff) who log into the Service, Rock Frost is the controller: we decide why and how that data is processed, as described in this policy.",
      "For the data your organization enters into the modules it enables, for example records about your own customers, students, patients, or employees, your organization is the controller and Rock Frost is the processor, acting only on your organization's instructions to provide the Service. If you are one of the individuals whose information a Rock Frost customer has recorded in the Service (for example, a patient, a student, or an employee of one of our customers), your request about that data should go to that organization; see section 8.",
    ],
  },
  {
    title: "2. What we collect",
    body: [
      "Website visitors: pages viewed and basic technical data collected only if you accept optional analytics (see our Cookie Policy), plus anything you submit through our contact form (name, email, organization, message, and the reason for your inquiry).",
      "Account holders: name, email address, hashed password (never stored in plain text), organization and role assignment, session and sign-in activity, and, if you enable it, an encrypted two-factor authentication secret.",
      "Customer Data your organization controls: whatever your organization's authorized users choose to record in the modules it has enabled. Depending on which modules your organization uses, this can include categories such as health information (Hospital), records concerning minors (School), employment and payroll information (HR & Payroll), or financial and payment records (Accounting, POS, Installment Sales). Rock Frost does not choose what is entered here. Your organization does, as controller.",
    ],
  },
  {
    title: "3. How we use information",
    body: [
      "To provide and operate the Service, including authenticating accounts, enforcing the permissions your organization assigns, and keeping each organization's data isolated from every other organization's.",
      "To respond to inquiries submitted through our contact form, and to send transactional messages such as account invitations, password resets, and security notifications.",
      "Where enabled, to power an optional AI support assistant inside the Service. Each reply is generated only from that conversation and from live data the requesting user already has permission to see through explicitly defined, permission-checked lookups: it cannot be asked to reach another organization's data, and it never emails anyone.",
      "We do not sell personal data, and we do not use Customer Data your organization controls for our own advertising or profiling purposes.",
    ],
  },
  {
    title: "4. Cookies",
    body: [
      "Our website uses essential cookies required for the site and Service to function, and optional analytics cookies that only load if you accept them. See our ",
    ],
    trailingLink: { href: "/cookie-policy", label: "Cookie Policy" },
    trailingSuffix: " for the full breakdown and how to change your choice at any time.",
  },
  {
    title: "5. Who we share information with",
    body: [
      "We use a small number of service providers to operate the Service, each processing data only as needed to provide their service to us:",
    ],
    list: [
      "Hosting and application delivery (Vercel)",
      "Database hosting, currently on infrastructure located in the United States (Neon, on AWS)",
      "Transactional email delivery, for invitations, password resets, and notifications (Resend)",
      "AI inference for the optional in-app support assistant, where an organization's users choose to use it (Groq)",
      "Payment processing, for organizations that pay online once a payment gateway is enabled on their account (Paystack and/or Flutterwave)",
    ],
    trailingBody: [
      "We do not permit these providers to use personal data they process on our behalf for their own independent purposes. We may also disclose information where required by law, to protect the rights or safety of Rock Frost or others, or in connection with a merger, acquisition, or sale of assets, with notice to affected customers where practicable.",
    ],
  },
  {
    title: "6. International data transfers",
    body: [
      "Because our database infrastructure is currently located outside Ghana, personal data processed through the Service may be transferred to and stored in other countries, including the United States. Where this applies, we rely on our providers' contractual and technical safeguards for cross-border data handling. Organizations with their own cross-border transfer obligations should factor this into their own compliance assessment.",
    ],
  },
  {
    title: "7. Data retention",
    body: [
      "We keep account and Customer Data for as long as an organization's subscription is active, plus a limited period afterward to allow data export or account reactivation, after which it may be deleted or anonymized in the ordinary course of our practices. Some modules let an organization configure its own retention-related settings (for example, correction windows or a stated retention period), which reflect that organization's own policy rather than an automatic deletion guarantee from Rock Frost. Organizations that need a specific retention or deletion commitment should contact us to arrange that in writing.",
    ],
  },
  {
    title: "8. Your rights",
    body: [
      "If Rock Frost is the controller of your data (as a website visitor or as an account holder), you may ask us to access, correct, or delete that data, or to explain how it is processed, through our contact page. We will respond in line with the Ghana Data Protection Act, 2012 (Act 843).",
      "If your data was entered into the Service by an organization using it (for example, you are that organization's patient, student, customer, or employee), Rock Frost is the processor, not the controller, of that data. Please direct your request to that organization directly; we will support them in responding to it.",
    ],
  },
  {
    title: "9. Security",
    body: [
      "We use organization-scoped (\"tenant-isolated\") data access, role-based permissions enforced on every request, bcrypt password hashing, encrypted two-factor authentication secrets, audited access to sensitive exports, and encrypted connections in transit. No system is completely immune to risk, and we have not represented this Service as independently certified (for example, SOC 2 or ISO/IEC 27001) or independently penetration-tested; our current control status is documented for customers who request it.",
    ],
  },
  {
    title: "10. Children's data",
    body: [
      "Our website and account sign-up are intended for business use by adults acting on behalf of an organization, not for use directly by children. Where an organization uses the School module to record information about minors, that organization is the controller of that data and is responsible for the lawful basis and any parental or guardian consent required under applicable law.",
    ],
  },
  {
    title: "11. Changes to this policy",
    body: [
      "We may update this policy as our practices, integrations, or legal obligations change. We will update the effective date below when we do, and will use reasonable efforts to notify active customers of material changes.",
    ],
  },
] as const;

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
      <p className="text-sm font-medium text-primary">Legal</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
        This policy explains how Rock Frost Technologies handles personal data across our website and Rock Frost Business Suite. It was last updated on {EFFECTIVE_DATE}.
      </p>
      <div className="mt-12 space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
            <div className="mt-3 space-y-3">
              {section.body.map((paragraph, index) => (
                <p key={index} className="leading-7 text-muted-foreground">
                  {paragraph}
                  {"trailingLink" in section && index === section.body.length - 1 ? (
                    <>
                      <Link href={section.trailingLink.href} className="font-medium text-foreground underline underline-offset-4">
                        {section.trailingLink.label}
                      </Link>
                      {section.trailingSuffix}
                    </>
                  ) : null}
                </p>
              ))}
              {"list" in section ? (
                <ul className="ml-5 list-disc space-y-1.5">
                  {section.list.map((item) => (
                    <li key={item} className="leading-7 text-muted-foreground">{item}</li>
                  ))}
                </ul>
              ) : null}
              {"trailingBody" in section
                ? section.trailingBody.map((paragraph, index) => (
                    <p key={`trailing-${index}`} className="leading-7 text-muted-foreground">{paragraph}</p>
                  ))
                : null}
            </div>
          </section>
        ))}
      </div>
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Questions about this policy, or a data-protection request where Rock Frost is the controller, can be sent through our{" "}
          <Link href="/contact?intent=legal" className="font-medium text-foreground underline underline-offset-4">contact page</Link>.
        </p>
      </section>
    </div>
  );
}
