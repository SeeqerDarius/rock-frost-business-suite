import { Lock, Tag, UserCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsBanner } from "@/components/settings/settings-banner";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCrmSettings, listActiveMembers, listLeadSources } from "@/modules/crm/service";
import { addLeadSource, saveCrmSettings } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage CRM settings.",
  "missing-fields": "A name is required.",
  "invalid-owner": "Choose an active organization member.",
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

  const [sources, members, settings] = await Promise.all([
    listLeadSources(tenant.organizationId),
    listActiveMembers(tenant.organizationId),
    getCrmSettings(tenant.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="CRM Settings" description="Module-wide configuration for CRM." />

      <SettingsBanner saved={saved} error={error} errorMessages={ERROR_MESSAGES} />

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCircle className="size-5 text-muted-foreground" />
            <CardTitle>Default owner</CardTitle>
          </div>
          <CardDescription>A new lead or deal created without an owner is automatically assigned here instead of sitting unowned.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveCrmSettings} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="defaultOwnerId">Default owner</Label>
              <Select name="defaultOwnerId" defaultValue={settings.defaultOwnerId ?? ""} items={{ "": "No default (leave unowned)", ...Object.fromEntries(members.map((m) => [m.id, m.name || m.email])) }}>
                <SelectTrigger id="defaultOwnerId" className="w-56"><SelectValue placeholder="No default (leave unowned)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No default (leave unowned)</SelectItem>
                  {members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name || member.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" variant="outline">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
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
