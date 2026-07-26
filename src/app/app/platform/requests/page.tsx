import { Inbox } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import {
  MODULE_REQUEST_PRIORITIES,
  MODULE_REQUEST_PRIORITY_LABELS,
  MODULE_REQUEST_STATUSES,
  MODULE_REQUEST_STATUS_LABELS,
  MODULE_REQUEST_TYPE_LABELS,
  MODULE_REQUEST_TYPES,
} from "@/platform/module-requests/constants";
import { convertContactSubmission, manageModuleRequest, resolveContactSubmission } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Check the update fields.",
  "update-failed": "The request could not be updated. Confirm the assignee and request type.",
  "invalid-conversion": "Choose an organization and valid request type.",
  "conversion-failed": "The inquiry or organization could not be linked.",
  "module-required": "An existing module must be selected for this request type.",
};

export default async function PlatformRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; converted?: string; error?: string }>;
}) {
  await requirePlatformOperator();
  const { updated, converted, error } = await searchParams;
  const [requests, operators, organizations, modules, inquiries] = await Promise.all([
    db.moduleRequest.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] } },
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
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
    db.organization.findMany({ where: { status: { in: ["ACTIVE", "TRIAL"] } }, orderBy: { name: "asc" } }),
    db.module.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.contactSubmission.findMany({
      where: { status: "NEW", intent: { in: ["DEMO", "MODULE", "CUSTOM_MODULE"] } },
      include: { module: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Module requests"
        description="Review customer demand, assign ownership, enable existing modules, and manage custom work."
      />
      {updated || converted ? (
        <Alert>
          <AlertTitle>{converted ? "Inquiry converted" : "Request updated"}</AlertTitle>
          <AlertDescription>The requester and platform records now reflect the change.</AlertDescription>
        </Alert>
      ) : null}
      {error && ERRORS[error] ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{ERRORS[error]}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Unlinked public inquiries</h2>
        {inquiries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No new public module inquiries.</p>
        ) : inquiries.map((inquiry) => (
          <Card key={inquiry.id}>
            <CardHeader>
              <CardTitle>{inquiry.company}</CardTitle>
              <CardDescription>{inquiry.name} · {inquiry.email} · {inquiry.phone || "No phone"} · prefers {inquiry.preferredContact.toLowerCase()} · {inquiry.createdAt.toLocaleString()}</CardDescription>
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Request queue</h2>
        {requests.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center py-10 text-center"><Inbox className="mb-3 size-8 text-muted-foreground" /><p className="font-medium">No module requests</p></CardContent></Card>
        ) : requests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{request.title}</CardTitle>
                  <CardDescription>
                    {request.organization.name} · {request.requestedBy.name || request.requestedBy.email}
                    {" · "}{MODULE_REQUEST_TYPE_LABELS[request.type]} · {request.module?.name ?? "No existing module"}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{MODULE_REQUEST_PRIORITY_LABELS[request.priority]}</Badge>
                  <Badge>{MODULE_REQUEST_STATUS_LABELS[request.status]}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div><p className="text-xs font-medium uppercase text-muted-foreground">Business need</p><p className="mt-1 whitespace-pre-wrap text-sm">{request.businessJustification}</p></div>
                <div><p className="text-xs font-medium uppercase text-muted-foreground">Customization details</p><p className="mt-1 whitespace-pre-wrap text-sm">{request.customizationDetails || "None supplied."}</p></div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Timeline</p>
                {request.events.map((event) => (
                  <div key={event.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>{event.author?.name || event.author?.email || "System"}{event.isInternal ? " · Internal" : ""}</span>
                      <span>{event.createdAt.toLocaleString()}</span>
                    </div>
                    {event.note ? <p className="mt-1 whitespace-pre-wrap">{event.note}</p> : null}
                  </div>
                ))}
              </div>
              <form action={manageModuleRequest} className="grid gap-4 border-t pt-4 md:grid-cols-2">
                <input type="hidden" name="requestId" value={request.id} />
                <div className="space-y-2">
                  <Label htmlFor={`assignee-${request.id}`}>Assigned operator</Label>
                  <select id={`assignee-${request.id}`} name="assignedToId" defaultValue={request.assignedToId ?? ""} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                    <option value="">Unassigned</option>
                    {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name || operator.email}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`status-${request.id}`}>Status</Label>
                  <select id={`status-${request.id}`} name="status" defaultValue={request.status} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                    {MODULE_REQUEST_STATUSES.map((status) => <option key={status} value={status}>{MODULE_REQUEST_STATUS_LABELS[status]}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`priority-${request.id}`}>Priority</Label>
                  <select id={`priority-${request.id}`} name="priority" defaultValue={request.priority} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                    {MODULE_REQUEST_PRIORITIES.map((priority) => <option key={priority} value={priority}>{MODULE_REQUEST_PRIORITY_LABELS[priority]}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`reference-${request.id}`}>Quote / external reference</Label>
                  <Input id={`reference-${request.id}`} name="externalReference" defaultValue={request.externalReference ?? ""} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`decision-${request.id}`}>Decision or customer-facing reason</Label>
                  <Textarea id={`decision-${request.id}`} name="decisionReason" defaultValue={request.decisionReason ?? ""} rows={2} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`note-${request.id}`}>Timeline note</Label>
                  <Textarea id={`note-${request.id}`} name="note" rows={2} />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" name="isInternal" value="true" /> Internal note — hidden from requester
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button type="submit">Save update</Button>
                  {request.type === "ENABLE_EXISTING" && request.moduleId ? (
                    <Button type="submit" name="enableModule" value="true" variant="outline">Approve and enable module</Button>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
