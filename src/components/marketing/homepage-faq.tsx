import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    question: "Is Rock Frost one product or several?",
    answer: "One workspace with independently activated modules. An organization only sees and pays for the products it turns on, but every module shares the same sign-in, permissions, and (where relevant) Accounting integration, instead of being separate logins stitched together.",
  },
  {
    question: "Which businesses is this built for?",
    answer: "Any organization that wants Fleet, Installment Sales, CRM, Inventory & Procurement, Accounting, HR & Payroll, Analytics, Point of Sale, Project Management, Hotel, School, Hostel, Pharmacy, or Hospital management, on one platform instead of separate tools per department.",
  },
  {
    question: "Can I try it before committing?",
    answer: "Trial workspaces are limited to three customer-facing products, so you can evaluate the platform's actual workflows before choosing a paid plan.",
  },
  {
    question: "How is pricing structured?",
    answer: "Each product has its own GHS monthly or annual price, with discounted combined-suite pricing when several products are activated together. See the pricing page for the current published catalogue.",
  },
  {
    question: "What happens to my data if I stop using a module?",
    answer: "Deactivating a module does not delete its records. Tenants also have on-demand Excel exports and full JSON system backups, so your data always stays exportable, not locked in.",
  },
] as const;

export function HomepageFaq() {
  return (
    <section className="public-section-tint">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="space-y-2">
          <p className="public-eyebrow">FAQ</p>
          <h2 className="text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
        </div>
        <div className="mt-8 divide-y divide-border">
          {FAQS.map((faq) => (
            <details key={faq.question} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:content-none">
                {faq.question}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
