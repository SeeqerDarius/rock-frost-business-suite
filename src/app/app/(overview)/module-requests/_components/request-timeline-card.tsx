"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MODULE_REQUEST_PRIORITY_LABELS,
  MODULE_REQUEST_STATUS_LABELS,
  MODULE_REQUEST_TYPE_LABELS,
} from "@/platform/module-requests/constants";
import type { addModuleRequestMessage } from "../actions";

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

export interface TenantRequestCardData {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  moduleName: string | null;
  businessJustification: string;
  customizationDetails: string | null;
  decisionReason: string | null;
  updatedLabel: string;
  isTerminal: boolean;
  events: Array<{ id: string; authorLabel: string; createdLabel: string; note: string | null; toStatus: string | null }>;
}

export function RequestTimelineCard({
  request,
  addMessageAction,
  defaultOpen = false,
}: {
  request: TenantRequestCardData;
  addMessageAction: typeof addModuleRequestMessage;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

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
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {MODULE_REQUEST_TYPE_LABELS[request.type as keyof typeof MODULE_REQUEST_TYPE_LABELS]}
            {request.moduleName ? ` · ${request.moduleName}` : ""} · {MODULE_REQUEST_PRIORITY_LABELS[request.priority as keyof typeof MODULE_REQUEST_PRIORITY_LABELS]} priority
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Updated {request.updatedLabel}</span>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {open ? (
        <CardContent className="space-y-4 border-t pt-5">
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

          {request.events.length > 0 ? (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Timeline</p>
              <ol className="space-y-2">
                {request.events.map((event) => (
                  <li key={event.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                      <span>{event.authorLabel}</span>
                      <span>{event.createdLabel}</span>
                    </div>
                    {event.toStatus ? <p className="mt-1 font-medium">{MODULE_REQUEST_STATUS_LABELS[event.toStatus as keyof typeof MODULE_REQUEST_STATUS_LABELS]}</p> : null}
                    {event.note ? <p className="mt-1 whitespace-pre-wrap">{event.note}</p> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {!request.isTerminal ? (
            <form action={addMessageAction} className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
              <input type="hidden" name="requestId" value={request.id} />
              <Input name="note" required placeholder="Add information or answer a question" />
              <Button type="submit" variant="outline">Add message</Button>
            </form>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
