import Link from "next/link";
import { Building2, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";

const STATUSES = ["ALL", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"] as const;

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; deleted?: string; error?: string }>;
}) {
  await requirePlatformOperator();
  const { q = "", status = "ALL", deleted, error } = await searchParams;
  const normalizedStatus = STATUSES.includes(status as (typeof STATUSES)[number]) ? status : "ALL";

  const organizations = await db.organization.findMany({
    where: {
      ...(normalizedStatus !== "ALL" ? { status: normalizedStatus as "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED" } : {}),
      ...(q.trim()
        ? {
            OR: [
              { name: { contains: q.trim(), mode: "insensitive" } },
              { tenantCode: { contains: q.trim(), mode: "insensitive" } },
              { billingEmail: { contains: q.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { members: true, moduleRequests: true } },
      organizationModules: { where: { enabled: true }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Organizations" description="Onboard, configure, suspend, restore, and retire tenant organizations." />
        <Button nativeButton={false} render={<Link href="/app/platform/organizations/new" />}>
          <Plus className="size-4" /> New organization
        </Button>
      </div>

      {deleted ? (
        <Alert>
          <AlertTitle>Organization permanently deleted</AlertTitle>
          <AlertDescription>The tenant data was removed after its scheduled recovery period.</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Organization action failed</AlertTitle>
          <AlertDescription>Check the submitted organization details and try again.</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Search name, tenant code, or billing email" className="pl-9" />
            </div>
            <select aria-label="Organization status" name="status" defaultValue={normalizedStatus} className="h-9 rounded-md border bg-transparent px-3 text-sm">
              {STATUSES.map((value) => <option key={value} value={value}>{value === "ALL" ? "All statuses" : value}</option>)}
            </select>
            <Button type="submit" variant="outline">Filter</Button>
          </form>
        </CardContent>
      </Card>

      {organizations.length === 0 ? (
        <EmptyState icon={Building2} title="No matching organizations" description="Change the filters or onboard a new organization." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {organizations.map((organization) => (
            <Card key={organization.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{organization.name}</CardTitle>
                    <CardDescription className="font-mono">{organization.tenantCode}</CardDescription>
                  </div>
                  <Badge variant={organization.status === "ACTIVE" ? "default" : "outline"}>{organization.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {organization.deletionScheduledFor ? (
                  <Alert variant="destructive">
                    <AlertTitle>Deletion scheduled</AlertTitle>
                    <AlertDescription>{organization.deletionScheduledFor.toLocaleString()}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md bg-muted/50 p-3"><p className="text-lg font-semibold">{organization._count.members}</p><p className="text-xs text-muted-foreground">Members</p></div>
                  <div className="rounded-md bg-muted/50 p-3"><p className="text-lg font-semibold">{organization.organizationModules.length}</p><p className="text-xs text-muted-foreground">Modules</p></div>
                  <div className="rounded-md bg-muted/50 p-3"><p className="text-lg font-semibold">{organization._count.moduleRequests}</p><p className="text-xs text-muted-foreground">Requests</p></div>
                </div>
                <Button className="w-full" variant="outline" nativeButton={false} render={<Link href={`/app/platform/organizations/${organization.id}`} />}>
                  Manage organization
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
