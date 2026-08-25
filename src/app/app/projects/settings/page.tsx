import { Hash, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getProjectsSettings } from "@/modules/projects/service";
import { saveProjectsSettings } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage Projects settings.",
  invalid: "Use 2-8 uppercase letters or numbers.",
};

export default async function ProjectsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("projects");

  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Projects Settings" description="Module-wide configuration for Project Management." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Projects settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const settings = await getProjectsSettings(tenant.organizationId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Projects Settings" description="Module-wide configuration for Project Management." />

      {saved ? (
        <Alert>
          <AlertTitle>Settings saved</AlertTitle>
          <AlertDescription>New projects will use the updated code prefix.</AlertDescription>
        </Alert>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <Alert variant="destructive">
          <AlertTitle>Settings were not saved</AlertTitle>
          <AlertDescription>{ERROR_MESSAGES[error]}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Hash className="size-5 text-muted-foreground" />
            <CardTitle>Project numbering</CardTitle>
          </div>
          <CardDescription>e.g. &quot;PRJ&quot; → PRJ-0001. Existing project codes are not renumbered.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProjectsSettings} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="projectCodePrefix">Project code prefix</Label>
              <Input
                id="projectCodePrefix"
                name="projectCodePrefix"
                defaultValue={settings.projectCodePrefix}
                minLength={2}
                maxLength={8}
                className="w-32 uppercase"
                required
              />
            </div>
            <Button type="submit" size="sm">Save</Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Task/milestone statuses and priorities are fixed, and milestone/project completion require every child
        task/milestone to be done. These are enforced business rules, not configurable settings.
      </p>
    </div>
  );
}
