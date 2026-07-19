import Link from "next/link";
import { Truck, Wallet, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const industries = [
  {
    icon: Truck,
    name: "Transportation & Logistics",
    description:
      "Fleet operators managing vehicles, drivers, and owner relationships across multiple companies or branches, with maintenance, insurance, and work-and-pay contracts to track.",
  },
  {
    icon: Wallet,
    name: "Retail & Consumer Finance",
    description:
      "Businesses selling on installment or layaway terms — tracking customer accounts, collections, product performance, and staff activity across a distributed sales team.",
  },
  {
    icon: Building2,
    name: "Multi-department organizations",
    description:
      "Any organization running several distinct business functions that shouldn't share data or navigation, but do benefit from one shared login, one workspace, and consistent access control.",
  },
];

export default function IndustriesPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm font-medium text-muted-foreground">Industries</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Where the platform fits today.</h1>
          <p className="text-lg text-muted-foreground">
            Rock Frost Business Suite is built module-first, so it grows into new industries as new modules are
            added. Here&apos;s where it fits right now.
          </p>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-4 sm:grid-cols-3">
            {industries.map((industry) => (
              <Card key={industry.name}>
                <CardHeader>
                  <industry.icon className="size-6 text-muted-foreground" />
                  <CardTitle className="mt-3">{industry.name}</CardTitle>
                  <CardDescription>{industry.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border p-8 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Not seeing your industry?</h2>
            <p className="text-muted-foreground">The module system is built to extend beyond these — tell us what you need.</p>
          </div>
          <Button nativeButton={false} render={<Link href="/contact" />}>
            Get in touch
          </Button>
        </div>
      </section>
    </>
  );
}
