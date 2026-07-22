import { Lock, Tag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listLeadSources } from "@/modules/crm/service";
import { addLeadSource } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage CRM settings.",
  "missing-fields": "A name is required.",
};

export default async function CrmSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("crm");

  if (!hasPermission(tenant, PERMISSIONS.CRM_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="CRM Settings" description="Module-wide configuration for CRM." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="CRM settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const sources = await listLeadSources(tenant.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader title="CRM Settings" description="Module-wide configuration for CRM." />

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="size-5 text-muted-foreground" />
            <CardTitle>Lead sources</CardTitle>
          </div>
          <CardDescription>Where your leads come from; shown as a dropdown when creating a new lead.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lead sources yet. New leads will use a free-text field until you add one.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <Badge key={source.id} variant={source.active ? "default" : "outline"}>
                  {source.name}
                </Badge>
              ))}
            </div>
          )}
          <form action={addLeadSource} className="flex gap-2">
            <Label htmlFor="name" className="sr-only">
              New lead source name
            </Label>
            <Input id="name" name="name" placeholder="e.g. Referral, Website, Trade show" className="max-w-xs" />
            <Button type="submit" size="sm" variant="outline">
              Add source
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
