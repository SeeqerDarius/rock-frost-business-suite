import { Building2, Lock, MapPinned } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export default async function OrganizationSettingsPage() {
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Organization" description="Organization profile, branches, and membership." />
        <EmptyState
          icon={Lock}
          title="You don't have access to this page"
          description="Organization settings are limited to roles with organization administration permissions."
        />
      </div>
    );
  }

  const [organization, branches] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: tenant.organizationId } }),
    db.branch.findMany({ where: { organizationId: tenant.organizationId }, orderBy: { createdAt: "asc" } }),
  ]);

  const profileFields: { label: string; value: string }[] = [
    { label: "Tenant code", value: organization.tenantCode },
    { label: "Industry", value: organization.industry ?? "Not set" },
    { label: "Status", value: organization.status },
    { label: "Country", value: organization.country ?? "Not set" },
    { label: "Currency", value: organization.currency },
    { label: "Timezone", value: organization.timezone },
    { label: "Billing email", value: organization.billingEmail ?? "Not set" },
    { label: "Website", value: organization.website ?? "Not set" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Organization" description="Organization profile, branches, and membership." />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-muted-foreground" />
            <CardTitle>{organization.name}</CardTitle>
          </div>
          <CardDescription>Organization profile</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {profileFields.map((field) => (
              <div key={field.label}>
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd className="text-sm font-medium">{field.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPinned className="size-5 text-muted-foreground" />
            <CardTitle>Branches</CardTitle>
          </div>
          <CardDescription>{branches.length} branch{branches.length === 1 ? "" : "es"} on record.</CardDescription>
        </CardHeader>
        <CardContent>
          {branches.length === 0 ? (
            <EmptyState icon={MapPinned} title="No branches yet" description="Branches will appear here once your organization adds them." />
          ) : (
            <div className="space-y-2">
              {branches.map((branch) => (
                <div key={branch.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">{branch.code}{branch.address ? ` (${branch.address})` : ""}</p>
                  </div>
                  <Badge variant={branch.status === "ACTIVE" ? "default" : "outline"}>{branch.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
