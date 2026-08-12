import { Activity, Building2, Users, Blocks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";

export default async function PlatformDashboardPage() {
  await requirePlatformOperator();
  const platformAnchorIds = await getPlatformAnchorOrganizationIds();

  const [organizationCount, activeMemberCount, enabledModuleCount, moduleAdoption] = await Promise.all([
    db.organization.count({ where: { id: { notIn: platformAnchorIds } } }),
    db.organizationMember.count({ where: { status: "ACTIVE", organizationId: { notIn: platformAnchorIds } } }),
    db.organizationModule.count({ where: { enabled: true, organizationId: { notIn: platformAnchorIds } } }),
    db.module.findMany({
      where: { status: "ACTIVE" },
      select: { name: true, organizationModules: { where: { enabled: true, organizationId: { notIn: platformAnchorIds } }, select: { id: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  // Only modules at least one organization has actually enabled — a module
  // nobody uses yet has no adoption to report.
  const adoptedModules = moduleAdoption.filter((mod) => mod.organizationModules.length > 0);

  const stats = [
    { label: "Organizations", value: organizationCount, description: "Tenant organizations on the platform", icon: <Building2 className="size-4" />, href: "/app/platform/organizations" },
    { label: "Active members", value: activeMemberCount, description: "Members across every organization", icon: <Users className="size-4" /> },
    { label: "Module activations", value: enabledModuleCount, description: "Modules enabled across all organizations", icon: <Blocks className="size-4" />, href: "/app/platform/modules" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" description="Organizations, subscriptions, and module activation across the whole platform." />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-muted-foreground" />
            <CardTitle>Module adoption</CardTitle>
          </div>
          <CardDescription>How many organizations have each module enabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {adoptedModules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organization has enabled any module yet.</p>
          ) : (
            adoptedModules.map((mod) => (
              <div key={mod.name} className="flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">{mod.name}</p>
                <p className="text-sm text-muted-foreground">
                  {mod.organizationModules.length} organization{mod.organizationModules.length === 1 ? "" : "s"}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
