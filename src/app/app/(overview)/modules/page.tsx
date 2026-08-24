import Link from "next/link";
import { redirect } from "next/navigation";
import { Blocks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { catalogueModuleRegistry, getModule } from "@/platform/modules/registry";
import { productGroupKeys } from "@/platform/modules/product-groups";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, isFleetDriverRole, PERMISSIONS } from "@/lib/auth/permissions";

/** A read-only "what's active" reference, distinct from Overview: the same
 * icon-tile visual as Overview's "Quick launch" grid, but plain (non-
 * clickable) divs instead of Links - this is a status list, not a launcher,
 * so navigating away from it isn't the point. */
export default async function ModulesPage() {
  const tenant = await requireCurrentTenant();
  if (isFleetDriverRole(tenant)) redirect("/app/dashboard");
  const canRequestModules = hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE);
  const enabledModules = catalogueModuleRegistry.flatMap((mod) => {
    const accessibleKey = productGroupKeys(mod.key).find((key) => tenant.accessibleModuleKeys.includes(key));
    const accessibleModule = accessibleKey ? getModule(accessibleKey) : null;
    return mod.status === "available" && accessibleModule ? [mod] : [];
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
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {enabledModules.map((mod) => (
            <div key={mod.key} className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center">
              <IconBadge size="lg" className="size-14 rounded-2xl"><mod.icon className="size-7" /></IconBadge>
              <span className="text-xs leading-tight font-medium">{mod.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
