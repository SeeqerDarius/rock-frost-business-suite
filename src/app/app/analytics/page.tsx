import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Activity, BedDouble, Building2, CalendarClock, ClipboardList, GraduationCap, Handshake, Hospital, Hotel, PackageSearch, Pill, ReceiptText, ShieldAlert, Truck, UsersRound, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { AttentionQueue, type AttentionQueueItem } from "@/components/dashboard/attention-queue";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createOrganizationFormatter } from "@/lib/org-format";
import { getAnalyticsOverview } from "@/modules/analytics/service";

interface ModuleSnapshot {
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

export default async function AnalyticsOverviewPage() {
  const tenant = await requireModuleAccess("analytics");

  if (!hasPermission(tenant, PERMISSIONS.ANALYTICS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics Overview" description="Cross-module business intelligence." />
        <EmptyState icon={ShieldAlert} title="You don't have access to this page" description="The analytics overview is limited to roles with overview permissions." />
      </div>
    );
  }

  const summary = await getAnalyticsOverview(tenant.organizationId, tenant.enabledModuleKeys);
  const money = createOrganizationFormatter(tenant.organization).money;

  const attentionCandidates: (AttentionQueueItem | null)[] = [
    summary.financial.accounting?.overdueInvoiceCount ? { id: "overdue-invoices", title: "Overdue invoices", value: summary.financial.accounting.overdueInvoiceCount, description: `${money(summary.financial.accounting.outstandingInvoiceTotal)} remains outstanding across sent and overdue invoices.`, href: "/app/accounting/invoices", severity: "urgent" } : null,
    summary.financial.accounting?.pendingExpenseCount ? { id: "pending-expenses", title: "Pending expenses", value: summary.financial.accounting.pendingExpenseCount, description: `${money(summary.financial.accounting.pendingExpenseTotal)} awaits approval or payment.`, href: "/app/accounting/expenses", severity: "review" } : null,
    summary.financial.payroll?.draftRunCount ? { id: "draft-payroll", title: "Draft payroll runs", value: summary.financial.payroll.draftRunCount, description: "Payroll runs have not been completed yet.", href: "/app/payroll", severity: "review" } : null,
    summary.sales.crm?.openLeadCount ? { id: "open-leads", title: "Open CRM leads", value: summary.sales.crm.openLeadCount, description: "Leads remain in new, contacted, or qualified stages.", href: "/app/crm", severity: "review" } : null,
    summary.operations.fleet?.pendingMaintenanceCount ? { id: "fleet-maintenance", title: "Fleet maintenance requests", value: summary.operations.fleet.pendingMaintenanceCount, description: "Maintenance work is not completed, verified, rejected, or cancelled.", href: "/app/fleet/maintenance", severity: "urgent" } : null,
    summary.operations.fleet?.expiringDocumentCount ? { id: "fleet-documents", title: "Fleet documents nearing renewal", value: summary.operations.fleet.expiringDocumentCount, description: "Insurance or roadworthy records are inside the configured reminder window.", href: "/app/fleet", severity: "urgent" } : null,
    summary.operations.inventory && summary.operations.inventory.lowStockItems.length > 0 ? { id: "low-stock", title: "Low-stock inventory items", value: summary.operations.inventory.lowStockItems.length, description: "Quantity is at or below the item reorder point.", href: "/app/inventory", severity: "urgent" } : null,
    summary.operations.procurement?.overdueOrderCount ? { id: "overdue-orders", title: "Overdue purchase orders", value: summary.operations.procurement.overdueOrderCount, description: "Open orders have passed their expected delivery date.", href: "/app/procurement", severity: "urgent" } : null,
    summary.projects?.overdueTaskCount ? { id: "overdue-project-tasks", title: "Overdue project tasks", value: summary.projects.overdueTaskCount, description: "Tasks are due and not marked done.", href: "/app/projects", severity: "urgent" } : null,
    summary.people.hr?.pendingLeaveCount ? { id: "pending-leave", title: "Pending leave requests", value: summary.people.hr.pendingLeaveCount, description: "Leave requests are awaiting a decision.", href: "/app/hr", severity: "review" } : null,
    summary.hotel?.housekeeping ? { id: "housekeeping", title: "Open housekeeping tasks", value: summary.hotel.housekeeping, description: "Housekeeping tasks are not completed.", href: "/app/hotel", severity: "review" } : null,
    summary.school?.overdueLoans ? { id: "overdue-library-loans", title: "Overdue library loans", value: summary.school.overdueLoans, description: "Borrowed school library items are past their due date.", href: "/app/school", severity: "review" } : null,
    summary.pharmacy?.expiringBatches ? { id: "expiring-pharmacy-batches", title: "Pharmacy batches expiring", value: summary.pharmacy.expiringBatches, description: "Available stock expires within the next 90 days.", href: "/app/pharmacy", severity: "urgent" } : null,
    summary.hospital?.activeAlerts ? { id: "active-clinical-alerts", title: "Active hospital alerts", value: summary.hospital.activeAlerts, description: "Clinical alert records remain active. Open Hospital to review them under the appropriate care controls.", href: "/app/hospital", severity: "urgent" } : null,
  ];
  const attentionItems = attentionCandidates.filter((item): item is AttentionQueueItem => item !== null);

  const moduleSnapshots: ModuleSnapshot[] = [
    summary.financial.accounting ? { name: "Accounting", description: `${money(summary.financial.accounting.totalRevenue)} posted revenue. ${money(summary.financial.accounting.cashBalance)} cash balance.`, href: "/app/accounting/dashboard", icon: Wallet } : null,
    summary.financial.payroll ? { name: "Payroll", description: `${summary.financial.payroll.employeesWithCompensationCount} employees with compensation. ${summary.financial.payroll.draftRunCount} draft runs.`, href: "/app/payroll", icon: ReceiptText } : null,
    summary.sales.crm ? { name: "CRM", description: `${money(summary.sales.crm.pipelineValue)} open pipeline. ${summary.sales.crm.openDealCount} open deals.`, href: "/app/crm", icon: Handshake } : null,
    summary.sales.installment ? { name: "Installment Sales", description: `${money(summary.sales.installment.totalCollected)} collected. ${money(summary.sales.installment.expectedReceivables)} expected receivables.`, href: "/app/installment", icon: ReceiptText } : null,
    summary.pos ? { name: "Point of Sale", description: `${money(summary.pos.todaysSalesTotal)} from ${summary.pos.todaysSalesCount} completed sales today.`, href: "/app/pos", icon: Activity } : null,
    summary.operations.fleet ? { name: "Fleet", description: `${summary.operations.fleet.vehicleCount} vehicles. ${summary.operations.fleet.pendingMaintenanceCount} maintenance requests in progress.`, href: "/app/fleet", icon: Truck } : null,
    summary.operations.inventory ? { name: "Inventory", description: `${money(summary.operations.inventory.totalStockValue)} stock value. ${summary.operations.inventory.lowStockItems.length} low-stock items.`, href: "/app/inventory", icon: PackageSearch } : null,
    summary.operations.procurement ? { name: "Procurement", description: `${summary.operations.procurement.openOrderCount} open orders. ${money(summary.operations.procurement.openOrderValue)} remains to be received.`, href: "/app/procurement", icon: ClipboardList } : null,
    summary.projects ? { name: "Projects", description: `${summary.projects.activeProjectCount} active projects. ${summary.projects.overdueTaskCount} overdue tasks.`, href: "/app/projects", icon: CalendarClock } : null,
    summary.people.hr ? { name: "Human Resources", description: `${summary.people.hr.activeEmployeeCount} active employees. ${summary.people.hr.pendingLeaveCount} leave requests pending.`, href: "/app/hr", icon: UsersRound } : null,
    summary.hotel ? { name: "Hotel", description: `${summary.hotel.occupiedRooms}/${summary.hotel.totalRooms} occupied rooms. ${summary.hotel.housekeeping} open housekeeping tasks.`, href: "/app/hotel", icon: Hotel } : null,
    summary.school ? { name: "School", description: `${summary.school.activeStudents} active students. ${money(summary.school.outstanding)} outstanding fees.`, href: "/app/school", icon: GraduationCap } : null,
    summary.hostel ? { name: "Hostel", description: `${summary.hostel.occupiedBeds}/${summary.hostel.totalBeds} occupied beds. ${money(summary.hostel.outstandingInvoiceTotal)} outstanding fees.`, href: "/app/hostel", icon: BedDouble } : null,
    summary.pharmacy ? { name: "Pharmacy", description: `${summary.pharmacy.medicineCount} active medicines. ${summary.pharmacy.expiringBatches} batches nearing expiry.`, href: "/app/pharmacy", icon: Pill } : null,
    summary.hospital ? { name: "Hospital", description: `${summary.hospital.admittedCount}/${summary.hospital.totalBeds} beds occupied. ${summary.hospital.activeAlerts} active alerts.`, href: "/app/hospital", icon: Hospital } : null,
  ].filter((module): module is ModuleSnapshot => module !== null);

  const priorityFollowUpCount = attentionItems.reduce((total, item) => total + (typeof item.value === "number" ? item.value : 0), 0);
  const stats = [
    { label: "Recognized revenue", value: summary.financial.accounting ? money(summary.financial.accounting.totalRevenue) : "Not available", description: summary.financial.accounting ? "Posted revenue in the Accounting ledger." : "Enable Accounting to use a canonical organization-wide revenue record.", icon: <Wallet className="size-4" />, href: summary.financial.accounting ? "/app/analytics/financial" : undefined },
    { label: "Cash balance", value: summary.financial.accounting ? money(summary.financial.accounting.cashBalance) : "Not available", description: summary.financial.accounting ? "Current balance of the cash account." : "Enable Accounting to see the cash-account balance.", icon: <Building2 className="size-4" />, href: summary.financial.accounting ? "/app/analytics/financial" : undefined },
    { label: "Open pipeline", value: summary.sales.crm ? money(summary.sales.crm.pipelineValue) : "Not available", description: summary.sales.crm ? `${summary.sales.crm.openDealCount} open CRM deals across the current pipeline.` : "Enable CRM to track opportunities in one place.", icon: <Handshake className="size-4" />, href: summary.sales.crm ? "/app/analytics/sales" : undefined },
    { label: "Priority follow-ups", value: priorityFollowUpCount, description: attentionItems.length > 0 ? `${attentionItems.length} source-module categories currently need review.` : "No tracked follow-up categories currently have items.", icon: <ClipboardList className="size-4" /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics Overview"
        description={`Current operational snapshot across ${summary.enabledModuleCount} enabled module${summary.enabledModuleCount === 1 ? "" : "s"}. Lifetime figures are labelled where applicable.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>

      <AttentionQueue items={attentionItems} description="Counts are live snapshots from the source modules. Select a row to continue in the related workflow." />

      <Card>
        <CardHeader>
          <CardTitle>Module snapshots</CardTitle>
          <CardDescription>
            All enabled product domains contribute only their own tenant-scoped summary. Select a module to investigate its underlying records.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {moduleSnapshots.map((module) => {
            const Icon = module.icon;
            return (
              <Link key={module.name} href={module.href as never} className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <IconBadge size="sm"><Icon className="size-4" /></IconBadge>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{module.name}</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">{module.description}</span>
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
