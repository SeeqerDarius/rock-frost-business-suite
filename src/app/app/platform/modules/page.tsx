import { Blocks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";

export default async function PlatformModulesPage() {
  await requirePlatformOperator();

  const modules = await db.module.findMany({
    include: { organizationModules: { where: { enabled: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Modules" description="Every module registered on the platform and its current build status." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <Card key={mod.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Blocks className="size-5 text-muted-foreground" />
                <Badge variant={mod.status === "ACTIVE" ? "default" : "outline"}>
                  {mod.status === "ACTIVE" ? "Available" : "Coming soon"}
                </Badge>
              </div>
              <CardTitle className="mt-3">{mod.name}</CardTitle>
              <CardDescription>
                {mod.organizationModules.length} organization{mod.organizationModules.length === 1 ? "" : "s"} enabled
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Key: {mod.code}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
