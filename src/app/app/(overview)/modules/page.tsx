import Link from "next/link";
import { Blocks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { moduleRegistry } from "@/platform/modules/registry";
import { requireCurrentTenant } from "@/lib/tenant";

export default async function ModulesPage() {
  const tenant = await requireCurrentTenant();
  const enabledModules = moduleRegistry.filter(
    (mod) => mod.status === "available" && tenant.accessibleModuleKeys.includes(mod.key),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Modules" description="Business systems enabled for your organization." />
      {enabledModules.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title="No modules enabled yet"
          description="Ask an administrator to enable a module for your organization."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enabledModules.map((mod) => (
            <Card key={mod.key}>
              <CardHeader>
                <mod.icon className="size-6 text-muted-foreground" />
                <CardTitle className="mt-3">{mod.name}</CardTitle>
                <CardDescription>{mod.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" nativeButton={false} render={<Link href={mod.routePrefix as never} />}>
                  Open
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
