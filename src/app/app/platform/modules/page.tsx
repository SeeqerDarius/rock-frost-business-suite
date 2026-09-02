import { Blocks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { catalogueModuleKeys, getModule } from "@/platform/modules/registry";
import { primaryProductKey } from "@/platform/modules/product-groups";
import { ModuleAvailabilityToggle } from "./module-availability-toggle";

const STATUS_BADGE = {
  ACTIVE: { label: "Available", variant: "default" as const },
  COMING_SOON: { label: "Coming soon", variant: "outline" as const },
  INACTIVE: { label: "Unavailable", variant: "destructive" as const },
};

export default async function PlatformModulesPage() {
  await requirePlatformOperator();

  const internalModules = await db.module.findMany({
    include: { organizationModules: { where: { enabled: true }, select: { organizationId: true } } },
    orderBy: { name: "asc" },
  });
  const modules = catalogueModuleKeys.flatMap((productKey) => {
    const record = internalModules.find((module) => module.code === productKey);
    if (!record) return [];
    const organizationIds = new Set(
      internalModules
        .filter((module) => primaryProductKey(module.code) === productKey)
        .flatMap((module) => module.organizationModules.map((assignment) => assignment.organizationId)),
    );
    return [{ ...record, name: getModule(productKey)?.name ?? record.name, organizationCount: organizationIds.size }];
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Products" description="Every customer-facing product registered on the platform, its current status, and whether it's offered to new customers." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <Card key={mod.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Blocks className="size-5 text-muted-foreground" />
                <Badge variant={STATUS_BADGE[mod.status].variant}>{STATUS_BADGE[mod.status].label}</Badge>
              </div>
              <CardTitle className="mt-3">{mod.name}</CardTitle>
              <CardDescription>
                {mod.organizationCount} organization{mod.organizationCount === 1 ? "" : "s"} enabled
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-3">
              <p className="text-xs text-muted-foreground">Product key: {mod.code}</p>
              <ModuleAvailabilityToggle moduleId={mod.id} available={mod.status === "ACTIVE"} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
