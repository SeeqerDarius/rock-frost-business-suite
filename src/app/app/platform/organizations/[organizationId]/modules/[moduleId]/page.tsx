import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { parseOrganizationModuleConfiguration } from "@/platform/module-requests/configuration";
import { updateOrganizationModuleConfiguration } from "./actions";

export default async function OrganizationModuleConfigurationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; moduleId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requirePlatformOperator();
  const { organizationId, moduleId } = await params;
  const { saved, error } = await searchParams;
  const [organization, module_, assignment] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    db.module.findUnique({ where: { id: moduleId } }),
    db.organizationModule.findUnique({
      where: { organizationId_moduleId: { organizationId, moduleId } },
    }),
  ]);
  if (!organization || !module_) notFound();

  const configuration = parseOrganizationModuleConfiguration(assignment?.configuration);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${module_.name} configuration`}
        description={`Organization-specific configuration for ${organization.name}.`}
      />
      {saved ? (
        <Alert>
          <AlertTitle>Configuration saved</AlertTitle>
          <AlertDescription>The validated configuration is now assigned only to this organization.</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Invalid configuration</AlertTitle>
          <AlertDescription>
            Use valid JSON with version, features, limits, workflow, terminology, and extensions fields.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Controlled module customization</CardTitle>
          <CardDescription>
            This changes configuration, feature flags, terminology, workflows, and supported extension keys.
            It does not inject arbitrary code or alter other organizations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateOrganizationModuleConfiguration} className="space-y-4">
            <input type="hidden" name="organizationId" value={organization.id} />
            <input type="hidden" name="moduleId" value={module_.id} />
            <div className="space-y-2">
              <Label htmlFor="configuration">Configuration JSON</Label>
              <Textarea
                id="configuration"
                name="configuration"
                className="min-h-96 font-mono text-xs"
                defaultValue={JSON.stringify(configuration, null, 2)}
                spellCheck={false}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Validate and save</Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/app/platform/organizations" />}>
                Back to organizations
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration contract</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><code>features</code>: named Boolean switches supported by the module.</p>
          <p><code>limits</code>: non-negative numeric thresholds supported by the module.</p>
          <p><code>workflow</code>: named workflow modes or approval strategies.</p>
          <p><code>terminology</code>: organization-specific labels such as “Client” or “Depot”.</p>
          <p><code>extensions</code>: supported extension keys deployed with the application.</p>
        </CardContent>
      </Card>
    </div>
  );
}

