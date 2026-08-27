import { Users, CalendarDays, Stethoscope, BedDouble, FlaskConical, Receipt, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import { getHospitalSummary } from "@/modules/hospital/service";

export default async function HospitalOverviewPage() {
  const tenant = await requireModuleAccess("hospital");
  const summary = await getHospitalSummary(tenant.organizationId);

  const stats = [
    { label: "Active patients", value: summary.activePatients, description: "Patients currently on record", icon: <Users className="size-4" />, href: "/app/hospital/patients" },
    { label: "Today's appointments", value: summary.todaysAppointments, description: "Scheduled or checked in today", icon: <CalendarDays className="size-4" />, href: "/app/hospital/appointments" },
    { label: "Open encounters", value: summary.openEncounters, description: "Visits not yet closed", icon: <Stethoscope className="size-4" />, href: "/app/hospital/encounters" },
    { label: "Beds occupied", value: `${summary.occupiedBeds}/${summary.totalBeds}`, description: "Occupied of total active beds", icon: <BedDouble className="size-4" />, href: "/app/hospital/admissions" },
    { label: "Pending lab items", value: summary.pendingLabItems, description: "Ordered tests not yet verified", icon: <FlaskConical className="size-4" />, href: "/app/hospital/laboratory" },
    { label: "Outstanding balance", value: formatMoney(summary.outstandingTotal, tenant.organization.currency), description: "Unpaid across open invoices", icon: <Receipt className="size-4" />, href: "/app/hospital/billing" },
    { label: "Active clinical alerts", value: summary.activeAlerts, description: "Unresolved patient alerts", icon: <AlertTriangle className="size-4" />, href: "/app/hospital/patients" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Hospital Overview" description="Patients, appointments, encounters, beds, laboratory, and billing at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
      <p className="rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        Rock Frost Hospital Management is operational record-keeping software. It is not a medical device, diagnosis
        engine, or clinical-decision system, and it does not certify regulatory compliance. Your organization remains
        responsible for Ghana Health Service/HeFRA, Data Protection Commission, NHIA, and other applicable
        professional and regulatory approvals, clinical review, consent practice, and record-retention policy.
      </p>
    </div>
  );
}
