import Link from "next/link";
import { Building2, Users, ShieldCheck, Receipt, DoorOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import { getHostelSummary } from "@/modules/hostel/service";

export default async function HostelOverviewPage() {
  const tenant = await requireModuleAccess("hostel");
  const summary = await getHostelSummary(tenant.organizationId);

  const cards = [
    { label: "Buildings", value: summary.buildingCount, href: "/app/hostel/buildings", icon: Building2 },
    { label: "Rooms", value: summary.roomCount, href: "/app/hostel/buildings", icon: DoorOpen },
    { label: "Beds occupied", value: `${summary.occupiedBeds} / ${summary.totalBeds}`, href: "/app/hostel/buildings", icon: Users },
    { label: "Active allocations", value: summary.activeAllocationCount, href: "/app/hostel/allocations", icon: Users },
    { label: "Wardens", value: summary.wardenCount, href: "/app/hostel/wardens", icon: ShieldCheck },
    { label: "Outstanding invoices", value: `${summary.outstandingInvoiceCount} (${formatMoney(summary.outstandingInvoiceTotal, tenant.organization.currency)})`, href: "/app/hostel/fees", icon: Receipt },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Hostel Overview" description="Boarding facility occupancy, allocations, and fee billing at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="transition-colors hover:border-primary/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription>{card.label}</CardDescription>
                  <card.icon className="size-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-2xl">{card.value}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
