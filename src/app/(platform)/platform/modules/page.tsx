import { Blocks } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { moduleRegistry } from "@/platform/modules/registry";

export default function PlatformModulesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Modules" description="Every module registered on the platform and its current build status." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {moduleRegistry.map((mod) => (
          <Card key={mod.key}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Blocks className="size-5 text-muted-foreground" />
                <Badge variant={mod.status === "available" ? "default" : "outline"}>
                  {mod.status === "available" ? "Available" : "Coming soon"}
                </Badge>
              </div>
              <CardTitle className="mt-3">{mod.name}</CardTitle>
              <CardDescription>{mod.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Key: {mod.key}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
