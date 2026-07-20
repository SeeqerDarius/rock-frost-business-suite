import { Activity, Building2, Users, Blocks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";

export default async function PlatformDashboardPage() {
  const [organizationCount, activeMemberCount, enabledModuleCount, moduleAdoption] = await Promise.all([
    db.organization.count(),
    db.organizationMember.count({ where: { status: "ACTIVE" } }),
    db.organizationModule.count({ where: { enabled: true } }),
    db.module.findMany({
      where: { status: "ACTIVE" },
      select: { name: true, organizationModules: { where: { enabled: true }, select: { id: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const stats = [
    { label: "Organizations", value: organizationCount, icon: Building2 },
    { label: "Active members", value: activeMemberCount, icon: Users },
    { label: "Module activations", value: enabledModuleCount, icon: Blocks },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" description="Organizations, subscriptions, and module activation across the whole platform." />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-muted-foreground" />
            <CardTitle>Module adoption</CardTitle>
          </div>
          <CardDescription>How many organizations have each available module enabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {moduleAdoption.map((mod) => (
            <div key={mod.name} className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">{mod.name}</p>
              <p className="text-sm text-muted-foreground">
                {mod.organizationModules.length} organization{mod.organizationModules.length === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
