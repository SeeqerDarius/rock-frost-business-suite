import { MessageSquarePlus } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  MODULE_REQUEST_PRIORITY_LABELS,
  MODULE_REQUEST_STATUS_LABELS,
  MODULE_REQUEST_TYPE_LABELS,
} from "@/platform/module-requests/constants";
import { addModuleRequestMessage, submitModuleRequest } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Check the request details and try again.",
  "module-required": "Select the existing module this request concerns.",
  "invalid-message": "Enter a valid message.",
};

export default async function ModuleRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; message?: string; error?: string }>;
}) {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/modules");

  const { submitted, message, error } = await searchParams;
  const [modules, requests] = await Promise.all([
    db.module.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.moduleRequest.findMany({
      where: { organizationId: tenant.organizationId },
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
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Module requests"
        description="Request activation, customization, integrations, migrations, or a purpose-built module."
      />

      {submitted ? (
        <Alert>
          <AlertTitle>Request submitted</AlertTitle>
          <AlertDescription>Rock Frost operators can now review, assign, and respond to it.</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert>
          <AlertTitle>Message added</AlertTitle>
          <AlertDescription>Your update has been added to the request timeline.</AlertDescription>
        </Alert>
      ) : null}
      {error && ERRORS[error] ? (
        <Alert variant="destructive">
          <AlertTitle>Request not submitted</AlertTitle>
          <AlertDescription>{ERRORS[error]}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>New request</CardTitle>
          <CardDescription>
            Existing modules can be enabled after approval. Custom work enters review and scoping first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submitModuleRequest} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">Request type</Label>
              <select
                id="type"
                name="type"
                defaultValue="ENABLE_EXISTING"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                {Object.entries(MODULE_REQUEST_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="moduleId">Existing module, if applicable</Label>
              <select
                id="moduleId"
                name="moduleId"
                defaultValue=""
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="">Not applicable / new module</option>
                {modules.map((module_) => (
                  <option key={module_.id} value={module_.id}>{module_.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title">Request title</Label>
              <Input id="title" name="title" required placeholder="What capability does your organization need?" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="businessJustification">Business need</Label>
              <Textarea id="businessJustification" name="businessJustification" required rows={4} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="customizationDetails">Workflow or customization details</Label>
              <Textarea
                id="customizationDetails"
                name="customizationDetails"
                rows={4}
                placeholder="Describe approvals, terminology, reports, integrations, or other special behavior."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedUsers">Expected users</Label>
              <Input id="expectedUsers" name="expectedUsers" type="number" min={1} step={1} />
            </div>
            <div className="flex items-end">
              <Button type="submit">Submit request</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Request history</h2>
        {requests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <MessageSquarePlus className="mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">No requests yet</p>
              <p className="text-sm text-muted-foreground">Submitted requests and their responses will appear here.</p>
            </CardContent>
          </Card>
        ) : requests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{request.title}</CardTitle>
                  <CardDescription>
                    {MODULE_REQUEST_TYPE_LABELS[request.type]} · {request.module?.name ?? "No existing module"}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{MODULE_REQUEST_PRIORITY_LABELS[request.priority]}</Badge>
                  <Badge>{MODULE_REQUEST_STATUS_LABELS[request.status]}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Business need</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{request.businessJustification}</p>
              </div>
              {request.customizationDetails ? (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Details</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{request.customizationDetails}</p>
                </div>
              ) : null}
              {request.decisionReason ? (
                <Alert>
                  <AlertTitle>Decision</AlertTitle>
                  <AlertDescription>{request.decisionReason}</AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Timeline</p>
                {request.events.map((event) => (
                  <div key={event.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                      <span>{event.author?.name || event.author?.email || "System"}</span>
                      <span>{event.createdAt.toLocaleString()}</span>
                    </div>
                    {event.toStatus ? <p className="mt-1 font-medium">{MODULE_REQUEST_STATUS_LABELS[event.toStatus]}</p> : null}
                    {event.note ? <p className="mt-1 whitespace-pre-wrap">{event.note}</p> : null}
                  </div>
                ))}
              </div>
              <form action={addModuleRequestMessage} className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                <input type="hidden" name="requestId" value={request.id} />
                <Input name="note" required placeholder="Add information or answer a question" />
                <Button type="submit" variant="outline">Add message</Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

