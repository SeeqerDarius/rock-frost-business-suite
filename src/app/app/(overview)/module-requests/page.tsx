import Link from "next/link";
import { MessageSquarePlus, Plus, Search } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { ModuleRequestStatus, Prisma } from "@prisma/client";
import {
  MODULE_REQUEST_TYPE_LABELS,
  TERMINAL_MODULE_REQUEST_STATUSES,
} from "@/platform/module-requests/constants";
import { addModuleRequestMessage, submitModuleRequest } from "./actions";
import { RequestTimelineCard, type TenantRequestCardData } from "./_components/request-timeline-card";

const ERRORS: Record<string, string> = {
  invalid: "Check the request details and try again.",
  "module-required": "Select the existing module this request concerns.",
  "invalid-message": "Enter a valid message.",
};

const VIEWS = ["open", "all", "resolved"] as const;
type View = (typeof VIEWS)[number];

function isView(value: string | undefined): value is View {
  return VIEWS.includes(value as View);
}

export default async function ModuleRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; message?: string; error?: string; view?: string; q?: string }>;
}) {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/modules");

  const query = await searchParams;
  const view: View = isView(query.view) ? query.view : "open";
  const search = (query.q ?? "").trim();

  const terminalStatuses = Array.from(TERMINAL_MODULE_REQUEST_STATUSES) as ModuleRequestStatus[];
  const statusFilter: Prisma.ModuleRequestWhereInput["status"] =
    view === "open" ? { notIn: terminalStatuses } : view === "resolved" ? { in: terminalStatuses } : undefined;

  const [modules, requests, openCount, resolvedCount] = await Promise.all([
    db.module.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.moduleRequest.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
      },
      include: {
        module: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        events: {
          where: { isInternal: false },
          include: { author: { select: { name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.moduleRequest.count({ where: { organizationId: tenant.organizationId, status: { notIn: terminalStatuses } } }),
    db.moduleRequest.count({ where: { organizationId: tenant.organizationId, status: { in: terminalStatuses } } }),
  ]);

  const cardData: TenantRequestCardData[] = requests.map((request) => ({
    id: request.id,
    title: request.title,
    type: request.type,
    status: request.status,
    priority: request.priority,
    moduleName: request.module?.name ?? null,
    businessJustification: request.businessJustification,
    customizationDetails: request.customizationDetails,
    decisionReason: request.decisionReason,
    updatedLabel: request.updatedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    isTerminal: terminalStatuses.includes(request.status),
    events: request.events.map((event) => ({
      id: event.id,
      authorLabel: event.author?.name || event.author?.email || "System",
      createdLabel: event.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
      note: event.note,
      toStatus: event.toStatus,
    })),
  }));

  const tabHref = (target: View) => `/app/module-requests?view=${target}`;

  const newRequestDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />New request</Button>}
      title="New module request"
      description="Existing modules can be enabled after approval. Custom work enters review and scoping first."
      action={submitModuleRequest}
      submitLabel="Submit request"
    >
      <div className="space-y-2">
        <Label htmlFor="type">Request type</Label>
        <select id="type" name="type" defaultValue="ENABLE_EXISTING" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
          {Object.entries(MODULE_REQUEST_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="moduleId">Existing module, if applicable</Label>
        <select id="moduleId" name="moduleId" defaultValue="" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
          <option value="">Not applicable / new module</option>
          {modules.map((module_) => (
            <option key={module_.id} value={module_.id}>{module_.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Request title</Label>
        <Input id="title" name="title" required placeholder="What capability does your organization need?" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="businessJustification">Business need</Label>
        <Textarea id="businessJustification" name="businessJustification" required rows={4} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="customizationDetails">Workflow or customization details</Label>
        <Textarea
          id="customizationDetails"
          name="customizationDetails"
          rows={3}
          placeholder="Describe approvals, terminology, reports, integrations, or other special behavior."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="expectedUsers">Expected users</Label>
        <Input id="expectedUsers" name="expectedUsers" type="number" min={1} step={1} />
      </div>
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Module requests"
          description="Request activation, customization, integrations, migrations, or a purpose-built module."
        />
        {newRequestDialog}
      </div>

      {query.submitted ? (
        <Alert>
          <AlertTitle>Request submitted</AlertTitle>
          <AlertDescription>Rock Frost operators can now review, assign, and respond to it.</AlertDescription>
        </Alert>
      ) : null}
      {query.message ? (
        <Alert>
          <AlertTitle>Message added</AlertTitle>
          <AlertDescription>Your update has been added to the request timeline.</AlertDescription>
        </Alert>
      ) : null}
      {query.error && ERRORS[query.error] ? (
        <Alert variant="destructive">
          <AlertTitle>Request not submitted</AlertTitle>
          <AlertDescription>{ERRORS[query.error]}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <nav className="flex flex-wrap gap-2" aria-label="Request views">
          {([
            ["open", "Open", openCount],
            ["all", "All", openCount + resolvedCount],
            ["resolved", "Resolved", resolvedCount],
          ] as const).map(([key, label, count]) => (
            <Button key={key} size="sm" variant={view === key ? "default" : "ghost"} nativeButton={false} render={<Link href={tabHref(key)} />}>
              {label}
              <Badge variant={view === key ? "secondary" : "outline"} className="ml-1">{count}</Badge>
            </Button>
          ))}
        </nav>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="flex gap-3" action="/app/module-requests">
            <input type="hidden" name="view" value={view} />
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input name="q" defaultValue={search} placeholder="Search your requests by title" className="pl-9" />
            </div>
            <Button type="submit" variant="outline">Search</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {cardData.length === 0 ? (
          <EmptyState
            icon={MessageSquarePlus}
            title={search ? "No requests match this search" : view === "resolved" ? "No resolved requests yet" : "No requests yet"}
            description={search ? "Try a different search term." : "Submitted requests and their responses will appear here."}
            action={!search && view !== "resolved" ? newRequestDialog : undefined}
          />
        ) : (
          cardData.map((request, index) => (
            <RequestTimelineCard key={request.id} request={request} addMessageAction={addModuleRequestMessage} defaultOpen={cardData.length === 1 || (index === 0 && view === "open" && !search)} />
          ))
        )}
      </div>
    </div>
  );
}
