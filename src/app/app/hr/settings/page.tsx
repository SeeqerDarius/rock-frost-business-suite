import { Lock, CalendarClock, Hash } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getHrSettings, listLeaveTypes } from "@/modules/hr/service";
import { addLeaveType, saveHrSettings } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage HR settings.",
  "missing-fields": "A name is required.",
  "invalid-prefix": "Use 2-8 uppercase letters or numbers.",
};

export default async function HrSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("hr");

  if (!hasPermission(tenant, PERMISSIONS.HR_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="HR Settings" description="Module-wide configuration for Human Resources." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="HR settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const [leaveTypes, settings] = await Promise.all([
    listLeaveTypes(tenant.organizationId),
    getHrSettings(tenant.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="HR Settings" description="Module-wide configuration for Human Resources." />

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
            <Hash className="size-5 text-muted-foreground" />
            <CardTitle>Employee numbering</CardTitle>
          </div>
          <CardDescription>e.g. &quot;EMP&quot; → EMP-0001. Existing employee numbers are not renumbered.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveHrSettings} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="employeeNumberPrefix">Employee number prefix</Label>
              <Input id="employeeNumberPrefix" name="employeeNumberPrefix" defaultValue={settings.employeeNumberPrefix} minLength={2} maxLength={8} className="w-32 uppercase" required />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="terminationApprovalRequired" defaultChecked={settings.terminationApprovalRequired} />Require a different HR approver for termination</label>
            <Button type="submit" size="sm" variant="outline">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-muted-foreground" />
            <CardTitle>Leave types</CardTitle>
          </div>
          <CardDescription>Categories of time off employees can request against.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {leaveTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave types yet. Add one before employees can request leave.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {leaveTypes.map((type) => (
                <Badge key={type.id} variant="outline">
                  {type.name} ({type.defaultDaysPerYear} days/yr)
                </Badge>
              ))}
            </div>
          )}
          <form action={addLeaveType} className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="e.g. Annual, Sick, Unpaid" className="max-w-xs" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultDaysPerYear">Days per year</Label>
              <Input id="defaultDaysPerYear" name="defaultDaysPerYear" type="number" defaultValue="0" className="w-32" />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Add leave type
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
