import { createPublicMetadata } from "@/lib/seo";

export const metadata = createPublicMetadata({
  title: "Terms of Service",
  description: "The terms governing use of Rock Frost Business Suite and the Rock Frost Technologies website.",
  path: "/terms",
  keywords: ["Rock Frost terms of service", "Rock Frost Business Suite terms"],
});

const EFFECTIVE_DATE = "19 August 2026";

const sections = [
  {
    title: "1. Who these terms apply to",
    body: [
      "These Terms of Service (\"Terms\") govern access to and use of the Rock Frost Technologies website and Rock Frost Business Suite (together, the \"Service\"), provided by Rock Frost Technologies (\"Rock Frost\", \"we\", \"us\"), a technology company operating in Ghana.",
      "The Service is provided to organizations (\"Customer\", \"Organization\", \"you\") for business use, not to individual consumers. If you accept these Terms on behalf of an organization, you confirm you have the authority to bind that organization, and \"you\" then refers to that organization.",
    ],
  },
  {
    title: "2. Accounts and access",
    body: [
      "Organizations gain access to Rock Frost Business Suite after Rock Frost creates the organization's workspace and its Owner accepts an invitation. The Owner and any administrators the Owner designates are responsible for inviting, managing, and removing the organization's own users, and for the accuracy of the roles and permissions assigned to them.",
      "You are responsible for maintaining the confidentiality of login credentials issued to your organization's users, and for all activity that occurs under those accounts. Notify us promptly through our contact page if you suspect unauthorized access.",
      "Optional two-factor authentication is available and recommended for accounts with elevated permissions.",
    ],
  },
  {
    title: "3. Subscriptions, trials, and billing",
    body: [
      "New organizations typically begin with a 14-day trial. Module pricing and bundle pricing current at the time of subscription are published on our Pricing page and are stated in Ghana Cedis (GHS).",
      "A subscription becomes active once payment is confirmed, either through an online payment gateway (where enabled) or through a manual payment method (bank transfer, mobile money, or another arrangement) confirmed by Rock Frost. If a trial ends without an active subscription, or a subscription is not renewed, access to the affected module(s) is suspended until payment is arranged; your organization's underlying data is not deleted solely because of a lapsed subscription.",
      "We may change module or bundle pricing for future billing periods. Where reasonably practicable, we will give existing subscribers advance notice before a price change takes effect on their next renewal.",
    ],
  },
  {
    title: "4. Your organization's data",
    body: [
      "Your organization retains ownership of the data it and its authorized users enter into the Service (\"Customer Data\"), including any data about your own customers, students, patients, employees, or other individuals that your organization chooses to record in the modules it enables.",
      "You are solely responsible for having a lawful basis to collect and process that data, for any notices or consents you owe to the individuals it concerns, and for complying with sector-specific obligations that apply to your organization (for example, obligations relevant to school, health, employment, or financial records). Rock Frost does not decide what data your organization records, and does not review it for lawfulness.",
      "See our Privacy Policy for how Rock Frost itself processes personal data, including the distinction between data about your organization's own account holders and Customer Data your organization controls.",
    ],
  },
  {
    title: "5. Acceptable use",
    body: [
      "You must not use the Service to violate applicable law, infringe another party's rights, transmit malicious code, or store or process data your organization is not lawfully permitted to hold.",
      "You must not attempt to bypass or undermine tenant isolation, access controls, or security features of the Service; attempt to access another organization's data; probe, scan, or test the Service's security without our prior written permission; or reverse engineer, decompile, or resell the Service except as expressly permitted in a separate written agreement.",
      "We may suspend access to protect the Service or other customers if we reasonably believe this section has been violated, and will aim to notify you when we do.",
    ],
  },
  {
    title: "6. Exporting your data and what happens when you leave",
    body: [
      "Authorized administrators can export their organization's active-module data from within the Service. We recommend exporting a current copy before ending a subscription or module.",
      "If your organization's subscription ends, we retain Customer Data for a limited period to allow you to arrange export or reactivation, after which it may be deleted or anonymized in the ordinary course of our data-handling practices. If your organization needs a specific retention or deletion commitment beyond what is described here, contact us to arrange that in writing.",
    ],
  },
  {
    title: "7. Intellectual property",
    body: [
      "Rock Frost and its licensors own all right, title, and interest in the Service, including its software, design, and documentation. These Terms grant your organization a limited, non-exclusive, non-transferable right to use the Service for your internal business purposes during an active subscription, and nothing else is transferred.",
      "You retain all rights in Customer Data. You grant Rock Frost only the rights necessary to host, process, and display that data as needed to operate the Service for you.",
    ],
  },
  {
    title: "8. Service availability and disclaimers",
    body: [
      "We work to keep the Service available and reliable, but the Service is provided \"as is\" and \"as available.\" We do not guarantee that it will be uninterrupted, error-free, or fit for a particular purpose beyond what is expressly stated in a separate written agreement with your organization. Planned maintenance and unplanned incidents can occur; we aim to communicate significant disruptions where practicable.",
    ],
  },
  {
    title: "9. Limitation of liability",
    body: [
      "To the maximum extent permitted by Ghanaian law, Rock Frost will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, or data, arising from use of the Service. Our total liability arising from these Terms or the Service in any twelve-month period will not exceed the amount your organization paid us for the Service in that period, except where a separate written agreement states otherwise or where liability cannot lawfully be limited.",
    ],
  },
  {
    title: "10. Termination",
    body: [
      "Your organization may stop using the Service at any time; ending all active subscriptions ends billing going forward. We may suspend or terminate access for material breach of these Terms, non-payment after notice, or if required by law, and will aim to give notice and a reasonable opportunity to cure where the circumstances allow.",
    ],
  },
  {
    title: "11. Governing law",
    body: [
      "These Terms are governed by the laws of Ghana, without regard to conflict-of-law principles. Disputes arising from these Terms or the Service are subject to the exclusive jurisdiction of the courts of Ghana, unless a separate written agreement between your organization and Rock Frost states otherwise.",
    ],
  },
  {
    title: "12. Changes to these Terms",
    body: [
      "We may update these Terms from time to time to reflect changes to the Service or our practices. We will update the effective date below when we do, and will use reasonable efforts to notify active customers of material changes before they take effect.",
    ],
  },
] as const;

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
      <p className="text-sm font-medium text-primary">Legal</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
        These Terms govern your organization&apos;s use of Rock Frost Business Suite and the Rock Frost Technologies website. They were last updated on {EFFECTIVE_DATE}.
      </p>
      <div className="mt-12 space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
            <div className="mt-3 space-y-3">
              {section.body.map((paragraph, index) => (
                <p key={index} className="leading-7 text-muted-foreground">{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Questions about these Terms, or requests for a separate written agreement covering your organization&apos;s specific needs, can be sent through our contact page.
        </p>
      </section>
    </div>
  );
}
