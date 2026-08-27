import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getHospitalSummary, listHospitalAppointments, listHospitalLabOrders, listHospitalAdmissions } from "@/modules/hospital/service";
import { ReportExportLinks } from "@/components/reports/report-export-links";

export default async function HospitalReportsPage() {
  const tenant = await requireModuleAccess("hospital");
  if (!hasPermission(tenant, PERMISSIONS.HOSPITAL_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hospital Reports" description="Operational summaries across patients, encounters, beds, laboratory, and billing." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Hospital reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const [summary, appointments, labOrders, admissions] = await Promise.all([
    getHospitalSummary(tenant.organizationId),
    listHospitalAppointments(tenant.organizationId),
    listHospitalLabOrders(tenant.organizationId),
    listHospitalAdmissions(tenant.organizationId),
  ]);
  const noShowCount = appointments.filter((a) => a.status === "NO_SHOW").length;
  const cancelledCount = appointments.filter((a) => a.status === "CANCELLED").length;
  const verifiedLabItems = labOrders.flatMap((o) => o.items).filter((i) => i.status === "VERIFIED").length;
  const totalLabItems = labOrders.flatMap((o) => o.items).length;
  const dischargedCount = admissions.filter((a) => a.status === "DISCHARGED").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Hospital Reports" description="Operational summaries across patients, encounters, beds, laboratory, and billing." actions={<ReportExportLinks moduleKey="hospital" />} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Patient census</CardTitle><CardDescription>Active patients and current bed occupancy.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Active patients</p><p className="text-lg font-medium">{summary.activePatients}</p></div>
            <div><p className="text-xs text-muted-foreground">Bed occupancy</p><p className="text-lg font-medium">{summary.occupiedBeds}/{summary.totalBeds}</p></div>
            <div><p className="text-xs text-muted-foreground">Currently admitted</p><p className="text-lg font-medium">{summary.admittedCount}</p></div>
            <div><p className="text-xs text-muted-foreground">Discharged to date</p><p className="text-lg font-medium">{dischargedCount}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Appointments</CardTitle><CardDescription>Scheduling outcomes across all recorded appointments.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Total appointments</p><p className="text-lg font-medium">{appointments.length}</p></div>
            <div><p className="text-xs text-muted-foreground">Today</p><p className="text-lg font-medium">{summary.todaysAppointments}</p></div>
            <div><p className="text-xs text-muted-foreground">No-shows</p><p className="text-lg font-medium">{noShowCount}</p></div>
            <div><p className="text-xs text-muted-foreground">Cancelled</p><p className="text-lg font-medium">{cancelledCount}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Laboratory</CardTitle><CardDescription>Result verification throughput.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Total ordered items</p><p className="text-lg font-medium">{totalLabItems}</p></div>
            <div><p className="text-xs text-muted-foreground">Verified</p><p className="text-lg font-medium">{verifiedLabItems}</p></div>
            <div><p className="text-xs text-muted-foreground">Pending</p><p className="text-lg font-medium">{summary.pendingLabItems}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Billing</CardTitle><CardDescription>Outstanding balance across open invoices.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Outstanding total</p><p className="text-lg font-medium">{formatMoney(summary.outstandingTotal, tenant.organization.currency)}</p></div>
            <div><p className="text-xs text-muted-foreground">Active clinical alerts</p><p className="text-lg font-medium">{summary.activeAlerts}</p></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
