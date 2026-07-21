import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { moduleRegistry } from "@/platform/modules/registry";
import { dashboardWidgets } from "@/platform/modules/dashboard-widgets";
import { requireCurrentTenant } from "@/lib/tenant";

export default async function OrganizationDashboardPage() {
  const tenant = await requireCurrentTenant();
  const enabledModules = moduleRegistry.filter((mod) => tenant.accessibleModuleKeys.includes(mod.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`A summary of the modules enabled for ${tenant.organization.name}.`}
      />
      {enabledModules.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No modules activated yet"
          description="Once your organization activates a module, its summary will appear here. Browse the module launcher to get started."
          action={
            <Button size="sm" nativeButton={false} render={<Link href="/app/modules" />}>
              Browse modules
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enabledModules.map((mod) => {
            const Widget = dashboardWidgets[mod.key];
            if (Widget) {
              return <Widget key={mod.key} />;
            }

            return (
              <Card key={mod.key}>
                <CardHeader>
                  <mod.icon className="size-6 text-muted-foreground" />
                  <CardTitle className="mt-3">{mod.name}</CardTitle>
                  <CardDescription>{mod.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={mod.routePrefix as never} />}>
                    Open {mod.name}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
