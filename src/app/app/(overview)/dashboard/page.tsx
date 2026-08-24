import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { catalogueModuleRegistry, getModule } from "@/platform/modules/registry";
import { productGroupKeys } from "@/platform/modules/product-groups";
import { dashboardWidgets } from "@/platform/modules/dashboard-widgets";
import { requireCurrentTenant } from "@/lib/tenant";

export default async function OrganizationDashboardPage() {
  const tenant = await requireCurrentTenant();
  const enabledModules = catalogueModuleRegistry.flatMap((mod) => {
    const accessibleKey = productGroupKeys(mod.key).find((key) => tenant.accessibleModuleKeys.includes(key));
    const accessibleModule = accessibleKey ? getModule(accessibleKey) : null;
    return accessibleModule ? [{ definition: mod, accessibleModule }] : [];
  });

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
          {enabledModules.map(({ definition: mod, accessibleModule }) => {
            const Widget = dashboardWidgets[accessibleModule.key];
            if (Widget) {
              return <Widget key={mod.key} linkable={false} />;
            }

            return (
              <Card key={mod.key}>
                <CardHeader>
                  <IconBadge size="lg"><mod.icon className="size-5" /></IconBadge>
                  <CardTitle className="mt-3">{mod.name}</CardTitle>
                  <CardDescription>{mod.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
