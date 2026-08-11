import { Users, Target, Handshake, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getCrmSummary } from "@/modules/crm/service";

export default async function CrmOverviewPage() {
  const tenant = await requireModuleAccess("crm");
  const summary = await getCrmSummary(tenant.organizationId);

  const stats = [
    { label: "Contacts", value: summary.contactCount, description: "People and companies on file", icon: <Users className="size-4" />, href: "/app/crm/contacts" },
    { label: "Open leads", value: summary.openLeadCount, description: "Leads not yet converted to a deal", icon: <Target className="size-4" />, href: "/app/crm/leads" },
    { label: "Open deals", value: summary.openDealCount, description: "Deals still in the pipeline", icon: <Handshake className="size-4" />, href: "/app/crm/deals" },
    { label: "Activity this month", value: summary.activityCountThisMonth, description: "Calls, emails, meetings, and notes logged", icon: <History className="size-4" />, href: "/app/crm/activities" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="CRM Overview" description="Contacts, leads, deals, and activity at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
