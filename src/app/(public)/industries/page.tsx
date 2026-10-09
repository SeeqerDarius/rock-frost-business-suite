import Link from "next/link";
import { Building2, Briefcase, GraduationCap, HeartPulse, Hotel, ShoppingBag, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { createPublicMetadata } from "@/lib/seo";
import { getModule } from "@/platform/modules/registry";
import { PublicHero } from "@/components/marketing/public-hero";

export const metadata = createPublicMetadata({
  title: "Business Software for Ghanaian Industries",
  description: "Business software for Ghanaian schools, hospitals, pharmacies, hotels, retailers, service firms, transport operators and installment sellers.",
  path: "/industries",
  keywords: ["business software Ghana industries", "school management software Ghana", "hospital management software Ghana", "retail management software Ghana", "hotel management software Ghana"],
});

const industries = [
  {
    icon: GraduationCap,
    name: "Education",
    description:
      "Run admissions, students and guardians, attendance, fees, examinations, timetables, transport and library, with boarding hostels on the same platform.",
    modules: ["school", "hostel", "accounting"],
  },
  {
    icon: HeartPulse,
    name: "Healthcare",
    description:
      "Manage patient records, appointments, admissions, laboratory, imaging and billing, alongside pharmacy stock, batches, expiry dates and dispensing.",
    modules: ["hospital", "pharmacy", "accounting"],
  },
  {
    icon: Hotel,
    name: "Hospitality",
    description:
      "Handle rooms, reservations, guests, check-in, folios, housekeeping and restaurant charges, with settled folios reaching the ledger automatically.",
    modules: ["hotel", "pos", "accounting"],
  },
  {
    icon: ShoppingBag,
    name: "Retail & Distribution",
    description:
      "Connect tills, stock, warehouses, suppliers, purchase approvals and customer relationships, with sales and payables flowing into Accounting.",
    modules: ["pos", "inventory", "crm"],
  },
  {
    icon: Briefcase,
    name: "Professional Services",
    description:
      "Track clients and deals, plan projects and milestones, run payroll and keep the books, with each team seeing only the work it is responsible for.",
    modules: ["crm", "projects", "hr"],
  },
  {
    icon: Truck,
    name: "Transport & Logistics",
    description:
      "Coordinate managers, drivers, vehicle owners and mechanics. Track remittances, work-and-pay contracts, maintenance approvals and documents.",
    modules: ["fleet", "accounting"],
  },
  {
    icon: Wallet,
    name: "Installment Sales",
    description:
      "Manage customer accounts, installment plans, collections and field sales teams, with payment history recorded against each account.",
    modules: ["installment", "crm"],
  },
  {
    icon: Building2,
    name: "Multi-department organizations",
    description:
      "Give departments and external stakeholders the access they need, preserve clear data boundaries and manage the organization from one shared source of truth.",
    modules: ["accounting", "hr", "analytics"],
  },
];

export default function IndustriesPage() {
  return (
    <>
      <PublicHero eyebrow="Industries" title="Technology shaped around real operating environments." description="One modular platform serving schools, healthcare providers, hotels, retailers, service firms and transport operators across Ghana. Activate the modules your sector needs and connect them to Accounting." />

      <section className="public-section-tint">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {industries.map((industry) => (
              <Card key={industry.name} className="flex flex-col">
                <CardHeader>
                  <IconBadge size="lg"><industry.icon className="size-5" /></IconBadge>
                  <CardTitle className="mt-3">{industry.name}</CardTitle>
                  <CardDescription>{industry.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex flex-wrap gap-x-3 gap-y-1">
                  {industry.modules.map((key) => {
                    const module_ = getModule(key);
                    return module_ ? (
                      <Link key={key} href={`/modules/${key}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                        {module_.name}
                      </Link>
                    ) : null;
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Not seeing your industry?</h2>
            <p className="text-muted-foreground">The module system is built to extend beyond these. Tell us what you need.</p>
          </div>
          <Button nativeButton={false} render={<Link href="/contact" />}>
            Get in touch
          </Button>
        </div>
      </section>
    </>
  );
}
