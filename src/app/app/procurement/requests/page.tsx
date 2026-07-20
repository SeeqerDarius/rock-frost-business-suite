import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listRequests } from "@/modules/procurement/service";
import { listItems } from "@/modules/inventory/service";
import { createNewRequest, approveExistingRequest, rejectExistingRequest } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage requests.",
  "missing-fields": "Description and quantity are required.",
  "invalid-state": "That action isn't valid for this request's current status.",
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
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE);
  const [requests, items] = await Promise.all([listRequests(tenant.organizationId), listItems(tenant.organizationId)]);
  const itemItems: Record<string, string> = Object.fromEntries(items.map((i) => [i.id, `${i.name} (${i.sku})`]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Requests" description="Purchase requests awaiting approval." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New request</Button>} title="New purchase request" action={createNewRequest}>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemId">Inventory item (optional)</Label>
              <Select name="itemId" defaultValue="" items={{ "": "None", ...itemItems }}>
                <SelectTrigger id="itemId" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {Object.entries(itemItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" name="quantity" type="number" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedCost">Estimated cost</Label>
                <Input id="estimatedCost" name="estimatedCost" type="number" step="0.01" />
              </div>
            </div>
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
              <TableHead>Est. cost</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-mono text-xs">{request.requestNumber}</TableCell>
                <TableCell className="font-medium">{request.description}</TableCell>
                <TableCell className="text-muted-foreground">{request.quantity}</TableCell>
                <TableCell className="text-muted-foreground">{request.estimatedCost ? Number(request.estimatedCost).toFixed(2) : "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[request.status]}>{request.status}</Badge>
                </TableCell>
                {canManage ? (
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
