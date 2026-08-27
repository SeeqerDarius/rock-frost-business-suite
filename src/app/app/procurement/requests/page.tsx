import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listRequests } from "@/modules/procurement/service";
import { listItems } from "@/modules/inventory/service";
import { createNewRequest, approveExistingRequest, rejectExistingRequest } from "./actions";
import { RequestLinesField } from "./request-lines-field";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage requests.",
  "missing-fields": "Description and quantity are required.",
  "invalid-state": "That action isn't valid for this request's current status.",
  "maker-checker": "The request creator cannot approve or reject the same request.",
  "not-found": "That item or request could not be found.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  CONVERTED: "secondary",
};

export default async function ProcurementRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("procurement");
  const canManage = hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE);
  const canApprove = hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_APPROVE);
  const [requests, items] = await Promise.all([listRequests(tenant.organizationId), listItems(tenant.organizationId)]);
  const itemOptions = items.map((item) => ({ id: item.id, label: `${item.name} (${item.sku})` }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Requests" description="Purchase requests awaiting approval." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New request</Button>} title="New purchase request" action={createNewRequest}>
            <RequestLinesField items={itemOptions} currency={tenant.organization.currency ?? "GHS"} />
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} />
            </div>
          </EntityDialog>
        ) : null}
      </div>

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

      {requests.length === 0 ? (
        <EmptyState icon={FileText} title="No requests yet" description="Purchase requests you create will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Est. cost ({tenant.organization.currency})</TableHead>
              <TableHead>Status</TableHead>
              {canApprove ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-mono text-xs">{request.requestNumber}</TableCell>
                <TableCell className="font-medium">{request.lines.length > 1 ? `${request.lines.length} requested items` : request.description}</TableCell>
                <TableCell className="text-muted-foreground">{request.lines.reduce((sum, line) => sum + line.quantity, 0)}</TableCell>
                <TableCell className="text-muted-foreground">{request.lines.some((line) => line.estimatedCost) ? formatMoney(request.lines.reduce((sum, line) => sum + Number(line.estimatedCost ?? 0), 0), tenant.organization.currency) : "-"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[request.status]}>{request.status}</Badge>
                </TableCell>
                {canApprove ? (
                  <TableCell className="text-right">
                    {request.status === "PENDING" ? (
                      <div className="flex justify-end gap-1">
                        <form action={approveExistingRequest}>
                          <input type="hidden" name="id" value={request.id} />
                          <Button type="submit" size="sm" variant="ghost">Approve</Button>
                        </form>
                        <form action={rejectExistingRequest}>
                          <input type="hidden" name="id" value={request.id} />
                          <Button type="submit" size="sm" variant="ghost">Reject</Button>
                        </form>
                      </div>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
