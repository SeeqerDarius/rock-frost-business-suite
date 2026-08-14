import Link from "next/link";
import { Inbox, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import type { ModuleRequestPriority, ModuleRequestStatus, ModuleRequestType, Prisma } from "@prisma/client";
import {
  MODULE_REQUEST_PRIORITIES,
  MODULE_REQUEST_PRIORITY_LABELS,
  MODULE_REQUEST_TYPE_LABELS,
  MODULE_REQUEST_TYPES,
  TERMINAL_MODULE_REQUEST_STATUSES,
} from "@/platform/module-requests/constants";
import { convertContactSubmission, manageModuleRequest, resolveContactSubmission } from "./actions";
import { RequestCard, type PlatformRequestCardData } from "./_components/request-card";
import { catalogueModuleKeys } from "@/platform/modules/registry";

const ERRORS: Record<string, string> = {
  invalid: "Check the update fields.",
  "update-failed": "The request could not be updated. Confirm the assignee and request type.",
  "invalid-conversion": "Choose an organization and valid request type.",
  "conversion-failed": "The inquiry or organization could not be linked.",
  "module-required": "An existing module must be selected for this request type.",
};

const VIEWS = ["queue", "inbox", "history"] as const;
type View = (typeof VIEWS)[number];

function isView(value: string | undefined): value is View {
  return VIEWS.includes(value as View);
}

export default async function PlatformRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    updated?: string;
    converted?: string;
    error?: string;
    view?: string;
    q?: string;
    priority?: string;
    type?: string;
  }>;
}) {
  await requirePlatformOperator();
  const platformAnchorIds = await getPlatformAnchorOrganizationIds();
  const query = await searchParams;
  const view: View = isView(query.view) ? query.view : "queue";
  const search = (query.q ?? "").trim();
  const priorityFilter = MODULE_REQUEST_PRIORITIES.includes(query.priority as ModuleRequestPriority) ? (query.priority as ModuleRequestPriority) : undefined;
  const typeFilter = MODULE_REQUEST_TYPES.includes(query.type as ModuleRequestType) ? (query.type as ModuleRequestType) : undefined;

  const statusFilter: Prisma.ModuleRequestWhereInput["status"] =
    view === "history"
      ? { in: Array.from(TERMINAL_MODULE_REQUEST_STATUSES) as ModuleRequestStatus[] }
      : { notIn: Array.from(TERMINAL_MODULE_REQUEST_STATUSES) as ModuleRequestStatus[] };

  const [requests, operators, organizations, modules, inquiries, activeCount, inboxCount, historyCount] = await Promise.all([
    view === "inbox"
      ? Promise.resolve([])
      : db.moduleRequest.findMany({
          where: {
            status: statusFilter,
            ...(priorityFilter ? { priority: priorityFilter } : {}),
            ...(typeFilter ? { type: typeFilter } : {}),
            ...(search
              ? {
                  OR: [
                    { title: { contains: search, mode: "insensitive" } },
                    { organization: { name: { contains: search, mode: "insensitive" } } },
                    { module: { name: { contains: search, mode: "insensitive" } } },
                  ],
                }
              : {}),
          },
          include: {
            organization: true,
            module: true,
            requestedBy: { select: { name: true, email: true } },
            assignedTo: { select: { name: true, email: true } },
            events: {
              include: { author: { select: { name: true, email: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: view === "history" ? { updatedAt: "desc" } : [{ priority: "desc" }, { createdAt: "desc" }],
        }),
    db.user.findMany({
      where: {
        status: "ACTIVE",
        organizationMemberships: {
          some: { status: "ACTIVE", role: { name: "Super Admin", isSystem: true, organizationId: null } },
        },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.organization.findMany({ where: { id: { notIn: platformAnchorIds }, status: { in: ["ACTIVE", "TRIAL"] } }, orderBy: { name: "asc" } }),
    db.module.findMany({ where: { status: "ACTIVE", code: { in: [...catalogueModuleKeys] } }, orderBy: { name: "asc" } }),
    view === "inbox" || view === "queue"
      ? db.contactSubmission.findMany({
          where: { status: "NEW", intent: { in: ["DEMO", "MODULE", "CUSTOM_MODULE"] } },
          include: { module: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    db.moduleRequest.count({ where: { status: { notIn: Array.from(TERMINAL_MODULE_REQUEST_STATUSES) as ModuleRequestStatus[] } } }),
    db.contactSubmission.count({ where: { status: "NEW", intent: { in: ["DEMO", "MODULE", "CUSTOM_MODULE"] } } }),
    db.moduleRequest.count({ where: { status: { in: Array.from(TERMINAL_MODULE_REQUEST_STATUSES) as ModuleRequestStatus[] } } }),
  ]);

  const operatorOptions = operators.map((operator) => ({ id: operator.id, label: operator.name || operator.email }));
  const cardData: PlatformRequestCardData[] = requests.map((request) => ({
    id: request.id,
    title: request.title,
    organizationName: request.organization.name,
    requesterLabel: request.requestedBy.name || request.requestedBy.email,
    type: request.type,
    status: request.status,
    priority: request.priority,
    moduleName: request.module?.name ?? null,
    businessJustification: request.businessJustification,
    customizationDetails: request.customizationDetails,
    decisionReason: request.decisionReason,
    externalReference: request.externalReference,
    assignedToId: request.assignedToId,
    updatedLabel: request.updatedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    isEnableExisting: request.type === "ENABLE_EXISTING" && Boolean(request.moduleId),
    events: request.events.map((event) => ({
      id: event.id,
      authorLabel: event.author?.name || event.author?.email || "System",
      createdLabel: event.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
      note: event.note,
      isInternal: event.isInternal,
      toStatus: event.toStatus,
    })),
  }));

  const tabHref = (target: View) => {
    const params = new URLSearchParams();
    params.set("view", target);
    return `/app/platform/requests?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Module requests"
        description="Review customer demand, assign ownership, enable existing modules, and manage custom work."
      />

      {query.updated || query.converted ? (
        <Alert>
          <AlertTitle>{query.converted ? "Inquiry converted" : "Request updated"}</AlertTitle>
          <AlertDescription>The requester and platform records now reflect the change.</AlertDescription>
        </Alert>
      ) : null}
      {query.error && ERRORS[query.error] ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{ERRORS[query.error]}</AlertDescription>
        </Alert>
      ) : null}

      <nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Request views">
        {([
          ["queue", "Active queue", activeCount],
          ["inbox", "Inbox", inboxCount],
          ["history", "History", historyCount],
        ] as const).map(([key, label, count]) => (
          <Button
            key={key}
            size="sm"
            variant={view === key ? "default" : "ghost"}
            nativeButton={false}
            render={<Link href={tabHref(key)} />}
          >
            {label}
            <Badge variant={view === key ? "secondary" : "outline"} className="ml-1">{count}</Badge>
          </Button>
        ))}
      </nav>

      {view !== "inbox" ? (
        <Card>
          <CardContent className="pt-6">
            <form className="flex flex-col gap-3 sm:flex-row" action={`/app/platform/requests`}>
              <input type="hidden" name="view" value={view} />
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input name="q" defaultValue={search} placeholder="Search title, organization, or module" className="pl-9" />
              </div>
              <select aria-label="Priority" name="priority" defaultValue={priorityFilter ?? ""} className="h-9 rounded-md border bg-transparent px-3 text-sm">
                <option value="">All priorities</option>
                {MODULE_REQUEST_PRIORITIES.map((priority) => <option key={priority} value={priority}>{MODULE_REQUEST_PRIORITY_LABELS[priority]}</option>)}
              </select>
              <select aria-label="Request type" name="type" defaultValue={typeFilter ?? ""} className="h-9 rounded-md border bg-transparent px-3 text-sm">
                <option value="">All types</option>
                {MODULE_REQUEST_TYPES.map((type) => <option key={type} value={type}>{MODULE_REQUEST_TYPE_LABELS[type]}</option>)}
              </select>
              <Button type="submit" variant="outline">Filter</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {view === "inbox" || (view === "queue" && inquiries.length > 0) ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Unlinked public inquiries</h2>
          {inquiries.length === 0 ? (
            <EmptyState icon={Inbox} title="No new public inquiries" description="Demo and module inquiries from the public contact form will appear here." />
          ) : inquiries.map((inquiry) => (
            <Card key={inquiry.id}>
              <CardHeader>
                <CardTitle>{inquiry.company}</CardTitle>
                <CardDescription>{inquiry.name} · {inquiry.email} · {inquiry.phone || "No phone"} · prefers {inquiry.preferredContact.toLowerCase()} · {inquiry.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm font-medium">{inquiry.intent === "DEMO" ? "Demo" : "Module"} · {inquiry.module?.name ?? "Custom module"}</p>
                <p className="whitespace-pre-wrap text-sm">{inquiry.message || "No additional message."}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" nativeButton={false} render={<a href={`mailto:${inquiry.email}`} />}>Email</Button>
                  {inquiry.phone ? <Button size="sm" variant="outline" nativeButton={false} render={<a href={`tel:${inquiry.phone}`} />}>Call</Button> : null}
                  {inquiry.phone ? <Button size="sm" variant="outline" nativeButton={false} render={<a href={`https://wa.me/${inquiry.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" />}>WhatsApp</Button> : null}
                </div>
                <Button nativeButton={false} render={<Link href={`/app/platform/organizations/new?inquiry=${inquiry.id}`} />}>
                  Create organization from inquiry
                </Button>
                <form action={convertContactSubmission} className="grid gap-3 md:grid-cols-4">
                  <input type="hidden" name="contactSubmissionId" value={inquiry.id} />
                  <select aria-label="Organization" name="organizationId" required defaultValue="" className="h-9 rounded-md border bg-transparent px-3 text-sm">
                    <option value="" disabled>Link organization</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>{organization.name}</option>
                    ))}
                  </select>
                  <select aria-label="Request type" name="type" defaultValue={inquiry.intent === "CUSTOM_MODULE" ? "CUSTOM_MODULE" : inquiry.intent === "DEMO" ? "DEMO" : "ENABLE_EXISTING"} className="h-9 rounded-md border bg-transparent px-3 text-sm">
                    {MODULE_REQUEST_TYPES.map((type) => (
                      <option key={type} value={type}>{MODULE_REQUEST_TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                  <select aria-label="Existing module" name="moduleId" defaultValue="" className="h-9 rounded-md border bg-transparent px-3 text-sm">
                    <option value="">No existing module</option>
                    {modules.map((module_) => (
                      <option key={module_.id} value={module_.id}>{module_.name}</option>
                    ))}
                  </select>
                  <Button type="submit">Convert to request</Button>
                </form>
                <div className="flex gap-2">
                  <form action={resolveContactSubmission}>
                    <input type="hidden" name="contactSubmissionId" value={inquiry.id} />
                    <input type="hidden" name="status" value="RESOLVED" />
                    <Button type="submit" size="sm" variant="outline">Resolve without request</Button>
                  </form>
                  <form action={resolveContactSubmission}>
                    <input type="hidden" name="contactSubmissionId" value={inquiry.id} />
                    <input type="hidden" name="status" value="SPAM" />
                    <Button type="submit" size="sm" variant="ghost">Mark spam</Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {view !== "inbox" ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{view === "history" ? "Resolved requests" : "Request queue"}</h2>
          {cardData.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={search || priorityFilter || typeFilter ? "No requests match this filter" : view === "history" ? "No resolved requests yet" : "No open requests"}
              description={search || priorityFilter || typeFilter ? "Try a different search term or clear the filters." : view === "history" ? "Completed, rejected, and cancelled requests will appear here." : "New requests from organizations will show up here for review."}
            />
          ) : (
            <div className="space-y-3">
              {cardData.map((request, index) => (
                <RequestCard key={request.id} request={request} operators={operatorOptions} manageAction={manageModuleRequest} defaultOpen={cardData.length === 1 || (view === "queue" && index === 0 && !search && !priorityFilter && !typeFilter)} />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
