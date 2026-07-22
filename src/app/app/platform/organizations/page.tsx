import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { ModuleToggle } from "./module-toggle";

export default async function PlatformOrganizationsPage() {
  await requirePlatformOperator();

  const [organizations, modules] = await Promise.all([
    db.organization.findMany({
      include: {
        members: true,
        organizationModules: { include: { module: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.module.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Organizations" description="Every organization using Rock Frost Business Suite." />

      {organizations.length === 0 ? (
        <EmptyState icon={Building2} title="No organizations yet" description="Organizations will appear here once onboarded." />
      ) : (
        <div className="space-y-4">
          {organizations.map((org) => {
            const enabledByModuleId = new Map(org.organizationModules.map((om) => [om.moduleId, om.enabled]));

            return (
              <Card key={org.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-5 text-muted-foreground" />
                      <CardTitle>{org.name}</CardTitle>
                    </div>
                    <Badge variant={org.status === "ACTIVE" ? "default" : "outline"}>{org.status}</Badge>
                  </div>
                  <CardDescription>
                    {org.tenantCode} · {org.members.length} member{org.members.length === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Modules</p>
                  <div className="space-y-2">
                    {modules.map((mod) => (
                      <div key={mod.id} className="flex items-center justify-between rounded-lg border p-3">
                        <p className="text-sm font-medium">{mod.name}</p>
                        <ModuleToggle organizationId={org.id} moduleId={mod.id} enabled={enabledByModuleId.get(mod.id) ?? false} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
