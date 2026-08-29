import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PeriodicTrendChart, BreakdownDonutChart } from "@/components/dashboard/charts";
import { catalogueModuleRegistry, getModule } from "@/platform/modules/registry";
import { productGroupKeys } from "@/platform/modules/product-groups";
import { dashboardWidgets } from "@/platform/modules/dashboard-widgets";
import { getCurrentTenant } from "@/lib/tenant";
import { isFleetDriverRole } from "@/lib/auth/permissions";
import { getRevenueInsights } from "@/lib/accounting-integration";

const ERROR_MESSAGES: Record<string, string> = {
  "no-organization-access": "Your account isn't assigned to an organization yet. Contact an administrator to be added to a workspace.",
  forbidden: "You don't have access to that page.",
  "module-unavailable": "That module isn't available for your account.",
};

export default async function OrganizationDashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  // getCurrentTenant() (not requireCurrentTenant()) so a tenant-resolution
  // failure degrades to this same message instead of throwing - this page is
  // the fallback landing target several guards (requireModuleAccess,
  // requirePlatformOperator) redirect to on that exact failure, so it must
  // survive a null tenant rather than re-throwing the error those guards
  // were trying to route around.
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" description="A summary of the modules enabled for your organization." />
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          {error && ERROR_MESSAGES[error] ? ERROR_MESSAGES[error] : "Your account isn't assigned to an organization yet. Contact an administrator to be added to a workspace."}
        </p>
      </div>
    );
  }
  // A Driver has no business seeing organization-wide revenue - this page's
  // own Revenue insights card sums every module's posted revenue with no
  // role scoping. /app/fleet/driver-portal is that role's real home (already
  // where /app/fleet itself redirects a Driver); redirecting here too closes
  // the leak instead of just hiding the card, so "Overview" in the sidebar
  // never dead-ends for a Driver the way /app/modules used to.
  if (isFleetDriverRole(tenant)) redirect("/app/fleet/driver-portal");
  const enabledModules = catalogueModuleRegistry.flatMap((mod) => {
    const accessibleKey = productGroupKeys(mod.key).find((key) => tenant.accessibleModuleKeys.includes(key));
    const accessibleModule = accessibleKey ? getModule(accessibleKey) : null;
    return accessibleModule ? [{ definition: mod, accessibleModule }] : [];
  });
  const revenueInsights = await getRevenueInsights(tenant.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`A summary of the modules enabled for ${tenant.organization.name}.`}
      />
      {revenueInsights ? (
        <Card>
          <CardHeader><CardTitle>Revenue insights</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="trend">
              <TabsList variant="line">
                <TabsTrigger value="trend">Revenue trend</TabsTrigger>
                <TabsTrigger value="by-module">By module</TabsTrigger>
              </TabsList>
              <TabsContent value="trend" className="mt-6">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Posted revenue across every module</p>
                <PeriodicTrendChart data={revenueInsights.trends} series={[{ key: "revenue", label: "Revenue" }]} currency={tenant.organization.currency} />
              </TabsContent>
              <TabsContent value="by-module" className="mt-6">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Lifetime revenue by module</p>
                <BreakdownDonutChart data={revenueInsights.byModule} currency={tenant.organization.currency} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
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
