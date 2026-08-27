import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getHostelSummary } from "@/modules/hostel/service";
import { ReportExportLinks } from "@/components/reports/report-export-links";

export default async function HostelReportsPage() {
  const tenant = await requireModuleAccess("hostel");

  if (!hasPermission(tenant, PERMISSIONS.HOSTEL_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hostel Reports" description="Occupancy, allocation, and fee billing indicators." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Hostel reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const summary = await getHostelSummary(tenant.organizationId);
  const stats = [
    { label: "Buildings", value: summary.buildingCount },
    { label: "Rooms", value: summary.roomCount },
    { label: "Total beds", value: summary.totalBeds },
    { label: "Occupied beds", value: summary.occupiedBeds },
    { label: "Available beds", value: summary.availableBeds },
    { label: "Active allocations", value: summary.activeAllocationCount },
    { label: "Wardens assigned", value: summary.wardenCount },
    { label: "Outstanding invoices", value: `${summary.outstandingInvoiceCount} (${formatMoney(summary.outstandingInvoiceTotal, tenant.organization.currency)})` },
    { label: "Total invoices", value: summary.invoiceCount },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Hostel Reports" description="Occupancy, allocation, and fee billing indicators." actions={<ReportExportLinks moduleKey="hostel" />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
