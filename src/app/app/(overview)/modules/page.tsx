import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moduleRegistry } from "@/platform/modules/registry";
import { requireCurrentTenant } from "@/lib/tenant";

export default async function ModulesPage() {
  const tenant = await requireCurrentTenant();

  return (
    <div className="space-y-6">
      <PageHeader title="Modules" description="Independent business systems available on this platform." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {moduleRegistry.map((mod) => {
          const isEnabled = mod.status === "available" && tenant.enabledModuleKeys.includes(mod.key);
          const isBuiltButNotEnabled = mod.status === "available" && !isEnabled;

          return (
            <Card key={mod.key}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <mod.icon className="size-6 text-muted-foreground" />
                  {mod.status === "coming-soon" ? <Badge variant="outline">Coming soon</Badge> : null}
                  {isBuiltButNotEnabled ? <Badge variant="outline">Not enabled</Badge> : null}
                </div>
                <CardTitle className="mt-3">{mod.name}</CardTitle>
                <CardDescription>{mod.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {isEnabled ? (
                  <Button size="sm" nativeButton={false} render={<Link href={mod.routePrefix as never} />}>
                    Open
                  </Button>
                ) : isBuiltButNotEnabled ? (
                  <Button size="sm" variant="outline" disabled>
                    Not enabled for your organization
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Not yet available
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
