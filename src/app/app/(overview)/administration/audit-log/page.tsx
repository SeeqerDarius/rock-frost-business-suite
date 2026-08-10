import Link from "next/link";
import { History, Lock, Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { Prisma } from "@prisma/client";
import { TENANT_AUDIT_ACTOR_WHERE, tenantAuditWhere } from "@/lib/audit-scope";

const PAGE_SIZE = 50;

const STATUS_ITEMS = { "": "Any status", SUCCESS: "Success", FAILURE: "Failure" };

interface AuditLogSearchParams {
  page?: string;
  from?: string;
  to?: string;
  module?: string;
  action?: string;
  entityName?: string;
  status?: string;
  actorId?: string;
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<AuditLogSearchParams> }) {
  const params = await searchParams;
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.AUDIT_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" description="A record of who did what, and when, in your organization." />
        <EmptyState
          icon={Lock}
          title="You don't have access to this page"
          description="Viewing the audit log requires the audit.view permission."
        />
      </div>
    );
  }

  const canExport = hasPermission(tenant, PERMISSIONS.AUDIT_EXPORT);

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const tenantScope = tenantAuditWhere(tenant.organizationId);
  const where: Prisma.AuditLogWhereInput = { ...tenantScope };
  if (params.from) where.createdAt = { ...where.createdAt as object, gte: new Date(`${params.from}T00:00:00`) };
  if (params.to) where.createdAt = { ...where.createdAt as object, lte: new Date(`${params.to}T23:59:59`) };
  if (params.module) where.module = params.module;
  if (params.action) where.action = { contains: params.action, mode: "insensitive" };
  if (params.entityName) where.entityName = params.entityName;
  if (params.status === "SUCCESS" || params.status === "FAILURE") where.status = params.status;
  if (params.actorId) where.userId = params.actorId;

  const [entries, totalCount, members, distinctModules, distinctEntityNames] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
    db.organizationMember.findMany({ where: { organizationId: tenant.organizationId, user: TENANT_AUDIT_ACTOR_WHERE }, include: { user: true } }),
    db.auditLog.findMany({ where: tenantScope, select: { module: true }, distinct: ["module"] }),
    db.auditLog.findMany({ where: tenantScope, select: { entityName: true }, distinct: ["entityName"] }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const actorItems = { "": "Anyone", ...Object.fromEntries(members.map((m) => [m.userId, m.user.name ?? m.user.email])) };
  const moduleItems = { "": "Any module", ...Object.fromEntries(distinctModules.filter((m) => m.module).map((m) => [m.module!, m.module!])) };
  const entityItems = { "": "Any entity", ...Object.fromEntries(distinctEntityNames.map((e) => [e.entityName, e.entityName])) };

  const queryString = new URLSearchParams(
    Object.entries(params).filter(([key, value]) => key !== "page" && value) as [string, string][],
  ).toString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Audit log" description="A record of who did what, and when, in your organization." />
        {canExport ? (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/api/audit-log/export?${queryString}`} />}
          >
            <Download />
            Export CSV
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-2">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={params.from} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={params.to} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actorId">Actor</Label>
              <Select name="actorId" defaultValue={params.actorId ?? ""} items={actorItems}>
                <SelectTrigger id="actorId" className="w-full">
                  <SelectValue placeholder="Anyone" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(actorItems).map(([value, label]) => (
                    <SelectItem key={value || "any"} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="module">Module</Label>
              <Select name="module" defaultValue={params.module ?? ""} items={moduleItems}>
                <SelectTrigger id="module" className="w-full">
                  <SelectValue placeholder="Any module" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(moduleItems).map(([value, label]) => (
                    <SelectItem key={value || "any"} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityName">Entity type</Label>
              <Select name="entityName" defaultValue={params.entityName ?? ""} items={entityItems}>
                <SelectTrigger id="entityName" className="w-full">
                  <SelectValue placeholder="Any entity" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(entityItems).map(([value, label]) => (
                    <SelectItem key={value || "any"} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={params.status ?? ""} items={STATUS_ITEMS}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_ITEMS).map(([value, label]) => (
                    <SelectItem key={value || "any"} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3 lg:col-span-6">
              <Input name="action" placeholder="Filter by action (e.g. invoice.payment)" defaultValue={params.action} />
            </div>
            <div className="sm:col-span-3 lg:col-span-6 flex justify-end">
              <Button type="submit" size="sm">
                Apply filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <EmptyState icon={History} title="No matching events" description="Try widening the date range or clearing a filter." />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{entry.createdAt.toLocaleString()}</TableCell>
                    <TableCell>{entry.user?.name ?? entry.user?.email ?? "System"}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.module ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.entityName}
                      {entry.entityId ? ` · ${entry.entityId}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.status === "SUCCESS" ? "default" : "destructive"}>{entry.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <p>
                Page {page} of {totalPages} ({totalCount} event{totalCount === 1 ? "" : "s"})
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`?${queryString}&page=${page - 1}`} />}>
                    Previous
                  </Button>
                ) : null}
                {page < totalPages ? (
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`?${queryString}&page=${page + 1}`} />}>
                    Next
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
