import { ShieldCheck, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHostelWardens, listHostelBuildings, listAssignableHostelUsers } from "@/modules/hostel/service";
import { assignWardenAction, removeWardenAction } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage hostel wardens.",
  invalid: "All required fields must be filled in correctly.",
  "not-found": "That building or warden assignment could not be found.",
};

export default async function HostelWardensPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("hostel");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSTEL_WARDENS_MANAGE);
  const [wardens, buildings, users] = await Promise.all([
    listHostelWardens(tenant.organizationId),
    listHostelBuildings(tenant.organizationId),
    listAssignableHostelUsers(tenant.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Wardens" description="Staff assigned responsibility for a hostel building." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />Assign warden</Button>} title="Assign a warden" action={assignWardenAction}>
            <div className="space-y-2">
              <Label htmlFor="buildingId">Building</Label>
              <select id="buildingId" name="buildingId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" required defaultValue="">
                <option value="" disabled>Select a building</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="userId">Staff member</Label>
              <select id="userId" name="userId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" required defaultValue="">
                <option value="" disabled>Select a staff member</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="title">Title</Label><Input id="title" name="title" placeholder="Warden, Assistant Warden..." /></div>
          </EntityDialog>
        ) : null}
      </div>

      {saved ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Saved.</div> : null}
      {error && ERROR_MESSAGES[error] ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERROR_MESSAGES[error]}</div> : null}

      {wardens.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No wardens assigned yet" description="Assign a staff member to a building to give them warden access." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Building</TableHead>
              <TableHead>Staff member</TableHead>
              <TableHead>Title</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {wardens.map((warden) => (
              <TableRow key={warden.id}>
                <TableCell className="font-medium">{warden.building.name}</TableCell>
                <TableCell className="text-muted-foreground">{warden.user.name || warden.user.email}</TableCell>
                <TableCell className="text-muted-foreground">{warden.title ?? "Warden"}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <form action={removeWardenAction}>
                      <input type="hidden" name="id" value={warden.id} />
                      <Button type="submit" size="sm" variant="ghost">Remove</Button>
                    </form>
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
