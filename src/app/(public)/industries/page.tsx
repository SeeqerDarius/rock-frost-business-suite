import Link from "next/link";
import { ArrowRight, BedDouble, GraduationCap, Hospital, Pill, ShoppingBasket, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { createPublicMetadata } from "@/lib/seo";
import { PublicHero } from "@/components/marketing/public-hero";

export const metadata = createPublicMetadata({
  title: "Business Software for Ghanaian Industries",
  description: "Explore Rock Frost software for transport and logistics, retail and installment sales, schools, healthcare, and hospitality operations.",
  path: "/industries",
  keywords: ["business software Ghana industries", "transport software Ghana", "retail management software Africa"],
});

const pathways = [
  {
    icon: Truck,
    title: "Transport & logistics",
    summary: "Coordinate vehicles, drivers, owners, maintenance, remittances, and work-and-pay contracts in a fleet workflow.",
    modules: [
      { name: "Fleet Management", key: "fleet" },
      { name: "Accounting", key: "accounting" },
    ],
    workflow: "Manage fleet activity, then review verified financial activity in Accounting when the modules are connected.",
  },
  {
    icon: ShoppingBasket,
    title: "Retail & installment sales",
    summary: "Bring checkout, stock control, purchasing, customer accounts, and collections into a set of connected business tools.",
    modules: [
      { name: "Point of Sale", key: "pos" },
      { name: "Inventory", key: "inventory" },
      { name: "Installment Management", key: "installment" },
    ],
    workflow: "Run sales and stock workflows, with optional customer accounts for installment operations.",
  },
  {
    icon: GraduationCap,
    title: "Schools & boarding",
    summary: "Manage admissions, attendance, academics, fees, campus services, and residential facilities for schools that need them.",
    modules: [
      { name: "School Management", key: "school" },
      { name: "Hostel Management", key: "hostel" },
    ],
    workflow: "Use School Management on its own, then add Hostel Management for boarding operations.",
  },
  {
    icon: Hospital,
    title: "Healthcare providers",
    summary: "Choose focused operational systems for hospital records and workflows, pharmacy inventory, dispensing, and reporting.",
    modules: [
      { name: "Hospital Management", key: "hospital" },
      { name: "Pharmacy Management", key: "pharmacy" },
    ],
    workflow: "Each product keeps its own specialist workflow. Review product boundaries and fit with our team before connecting systems.",
  },
  {
    icon: BedDouble,
    title: "Hotels & hospitality",
    summary: "Coordinate reservations, guest stays, folios, housekeeping, food and beverage, and property operations.",
    modules: [
      { name: "Hotel Management", key: "hotel" },
      { name: "Accounting", key: "accounting" },
    ],
    workflow: "Manage property operations in Hotel Management and explore Accounting for the wider financial workflow.",
  },
] as const;

export default function IndustriesPage() {
  return (
    <>
      <PublicHero
        eyebrow="Solutions by industry"
        title="Start with the way your organization works."
        description="Explore focused workflows for transport, retail, education, healthcare, and hospitality. Choose the modules that fit your operation, then talk with our team about how they work together."
        actions={<Button size="lg" nativeButton={false} render={<Link href="/contact?intent=demo" />}>Discuss your workflow</Button>}
      />

      <section className="public-section-tint" aria-label="Industry software pathways">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl space-y-2">
            <p className="public-eyebrow">Find your starting point</p>
            <h2 className="text-2xl font-semibold tracking-tight">A clear path from your work to the right tools</h2>
            <p className="text-muted-foreground">Each path links to product details, so you can review the workflows before you get in touch.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {pathways.map((pathway) => (
              <Card key={pathway.title} className="flex h-full flex-col">
                <CardHeader>
                  <IconBadge size="lg"><pathway.icon className="size-5" /></IconBadge>
                  <CardTitle className="mt-3">{pathway.title}</CardTitle>
                  <CardDescription>{pathway.summary}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-5">
                  <p className="text-sm leading-6 text-muted-foreground">{pathway.workflow}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4">
                    {pathway.modules.map((module) => (
                      <Link key={module.key} href={`/modules/${module.key}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                        {module.name}<ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Your workflow spans more than one industry?</h2>
            <p className="max-w-2xl text-muted-foreground">Tell us how your teams work. We can help you review the relevant modules and their boundaries.</p>
          </div>
          <Button nativeButton={false} render={<Link href="/contact?intent=demo" />}>Talk to our team</Button>
        </div>
      </section>
    </>
  );
}
