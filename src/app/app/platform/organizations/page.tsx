import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/lib/db";
import { ModuleToggle } from "./module-toggle";
import { toggleOrganizationModule } from "../actions";

export default async function PlatformOrganizationsPage() {
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
            const enabledModules = modules.filter((mod) => enabledByModuleId.get(mod.id));
            const availableModules = modules.filter((mod) => !enabledByModuleId.get(mod.id));
            const availableItems = Object.fromEntries(availableModules.map((mod) => [mod.id, mod.name]));

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
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Enabled modules
                    </p>
                    {enabledModules.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No modules enabled yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {enabledModules.map((mod) => (
                          <div key={mod.id} className="flex items-center justify-between rounded-lg border p-3">
                            <p className="text-sm font-medium">{mod.name}</p>
                            <ModuleToggle organizationId={org.id} moduleId={mod.id} enabled={true} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {availableModules.length > 0 ? (
                    <form action={toggleOrganizationModule} className="flex items-end gap-2 border-t pt-4">
                      <input type="hidden" name="organizationId" value={org.id} />
                      <input type="hidden" name="enabled" value="true" />
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Enable a module
                        </p>
                        <Select name="moduleId" items={availableItems}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a module to enable" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableModules.map((mod) => (
                              <SelectItem key={mod.id} value={mod.id}>
                                {mod.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" size="sm">
                        Enable
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
