"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MODULE_REQUEST_PRIORITIES,
  MODULE_REQUEST_PRIORITY_LABELS,
  MODULE_REQUEST_STATUSES,
  MODULE_REQUEST_STATUS_LABELS,
  MODULE_REQUEST_TYPE_LABELS,
} from "@/platform/module-requests/constants";
import type { manageModuleRequest } from "../actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";

const PRIORITY_VARIANT: Record<string, "outline" | "secondary" | "destructive"> = {
  LOW: "outline",
  NORMAL: "outline",
  HIGH: "secondary",
  URGENT: "destructive",
};

const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  SUBMITTED: "secondary",
  UNDER_REVIEW: "secondary",
  NEEDS_INFORMATION: "destructive",
  QUOTED: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  IMPLEMENTING: "default",
  READY: "default",
  COMPLETED: "outline",
  CANCELLED: "outline",
};

export interface PlatformRequestCardData {
  id: string;
  title: string;
  organizationName: string;
  requesterLabel: string;
  type: string;
  status: string;
  priority: string;
  moduleName: string | null;
  businessJustification: string;
  customizationDetails: string | null;
  decisionReason: string | null;
  externalReference: string | null;
  assignedToId: string | null;
  updatedLabel: string;
  isEnableExisting: boolean;
  events: Array<{ id: string; authorLabel: string; createdLabel: string; note: string | null; isInternal: boolean; toStatus: string | null }>;
}

export function RequestCard({
  request,
  operators,
  manageAction,
  defaultOpen = false,
}: {
  request: PlatformRequestCardData;
  operators: Array<{ id: string; label: string }>;
  manageAction: typeof manageModuleRequest;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const formId = `manage-request-${request.id}`;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 sm:px-6"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{request.title}</p>
            <Badge variant={STATUS_VARIANT[request.status] ?? "outline"}>{MODULE_REQUEST_STATUS_LABELS[request.status as keyof typeof MODULE_REQUEST_STATUS_LABELS]}</Badge>
            <Badge variant={PRIORITY_VARIANT[request.priority] ?? "outline"}>{MODULE_REQUEST_PRIORITY_LABELS[request.priority as keyof typeof MODULE_REQUEST_PRIORITY_LABELS]}</Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {request.organizationName} · {request.requesterLabel} · {MODULE_REQUEST_TYPE_LABELS[request.type as keyof typeof MODULE_REQUEST_TYPE_LABELS]}
            {request.moduleName ? ` · ${request.moduleName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Updated {request.updatedLabel}</span>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {open ? (
        <CardContent className="space-y-5 border-t pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Business need</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{request.businessJustification}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Customization details</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{request.customizationDetails || "None supplied."}</p>
            </div>
          </div>

          {request.events.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Timeline</p>
              <ol className="space-y-2">
                {request.events.map((event) => (
                  <li key={event.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>{event.authorLabel}{event.isInternal ? " · Internal" : ""}</span>
                      <span>{event.createdLabel}</span>
                    </div>
                    {event.toStatus ? <p className="mt-1 text-xs font-medium">{MODULE_REQUEST_STATUS_LABELS[event.toStatus as keyof typeof MODULE_REQUEST_STATUS_LABELS]}</p> : null}
                    {event.note ? <p className="mt-1 whitespace-pre-wrap">{event.note}</p> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <form id={formId} action={manageAction} className="grid gap-4 border-t pt-5 md:grid-cols-2">
            <input type="hidden" name="requestId" value={request.id} />
            <div className="space-y-2">
              <Label htmlFor={`assignee-${request.id}`}>Assigned operator</Label>
              <select id={`assignee-${request.id}`} name="assignedToId" defaultValue={request.assignedToId ?? ""} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                <option value="">Unassigned</option>
                {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.label}</option>)}
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
          </form>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button type="submit" form={formId} size="sm">Save update</Button>
            {request.isEnableExisting ? (
              <ConfirmSubmitButton
                formId={formId}
                name="enableModule"
                value="true"
                triggerLabel="Approve and enable module"
                title="Approve and enable this module?"
                description={`This immediately grants ${request.organizationName} access to ${request.moduleName ?? "the requested module"} and marks the request Completed. Users still need the module's own permission to use it.`}
                confirmLabel="Approve and enable"
              />
            ) : null}
            {request.status !== "REJECTED" ? (
              <ConfirmSubmitButton
                formId={formId}
                name="rejectRequest"
                value="true"
                triggerLabel="Reject"
                title="Reject this request?"
                description="The requester will see this decision and any reason you enter above. This does not delete the request."
                confirmLabel="Reject request"
                variant="destructive"
                triggerVariant="ghost"
              />
            ) : null}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
