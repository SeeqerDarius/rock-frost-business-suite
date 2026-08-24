import Link from "next/link";
import { redirect } from "next/navigation";
import { Blocks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { catalogueModuleRegistry, getModule } from "@/platform/modules/registry";
import { productGroupKeys } from "@/platform/modules/product-groups";
import { dashboardWidgets } from "@/platform/modules/dashboard-widgets";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, isFleetDriverRole, PERMISSIONS } from "@/lib/auth/permissions";

/** A read-only "what's active" reference, distinct from Overview: reuses the
 * same per-module summary widgets Overview shows, but with linkable={false}
 * so no "Open X" button appears here - a user only sees which modules are
 * active, and navigates from the sidebar or Overview instead. */
export default async function ModulesPage() {
  const tenant = await requireCurrentTenant();
  if (isFleetDriverRole(tenant)) redirect("/app/dashboard");
  const canRequestModules = hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE);
  const enabledModules = catalogueModuleRegistry.flatMap((mod) => {
    const accessibleKey = productGroupKeys(mod.key).find((key) => tenant.accessibleModuleKeys.includes(key));
    const accessibleModule = accessibleKey ? getModule(accessibleKey) : null;
    return mod.status === "available" && accessibleModule ? [{ definition: mod, accessibleModule }] : [];
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Modules" description="Business systems active for your organization." />
        {canRequestModules ? (
          <Button variant="outline" nativeButton={false} render={<Link href="/app/module-requests" />}>
            Request a module
          </Button>
        ) : null}
      </div>
      {enabledModules.length === 0 ? (
        <EmptyState
          icon={Blocks}
          title="No modules enabled yet"
          description="Ask an administrator to enable a module for your organization."
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
