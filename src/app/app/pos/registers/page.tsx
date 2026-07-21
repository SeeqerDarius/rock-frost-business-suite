import { Store, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listRegisters } from "@/modules/pos/service";
import { listWarehouses } from "@/modules/inventory/service";
import { upsertRegister, openRegisterSession, closeRegisterSession } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage registers or sessions.",
  "missing-fields": "All required fields must be filled in.",
  "session-open": "This register already has an open session.",
  "session-closed": "This session is already closed.",
  "not-found": "That register could not be found.",
};

interface RegisterFieldsProps {
  register?: { name: string; warehouseId: string | null; active: boolean };
  warehouseItems: Record<string, string>;
}

function RegisterFields({ register, warehouseItems }: RegisterFieldsProps) {
  const idSuffix = register ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`name${idSuffix}`}>Name</Label>
        <Input id={`name${idSuffix}`} name="name" defaultValue={register?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`warehouseId${idSuffix}`}>Warehouse (for stock deduction)</Label>
        <Select name="warehouseId" defaultValue={register?.warehouseId ?? ""} items={{ "": "None", ...warehouseItems }}>
          <SelectTrigger id={`warehouseId${idSuffix}`} className="w-full">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">None</SelectItem>
            {Object.entries(warehouseItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Switch id={`active${idSuffix}`} name="active" defaultChecked={register?.active ?? true} />
        <Label htmlFor={`active${idSuffix}`}>Active</Label>
      </div>
    </>
  );
}

export default async function PosRegistersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManageRegisters = hasPermission(tenant, PERMISSIONS.POS_REGISTERS_MANAGE);
  const canManageSessions = hasPermission(tenant, PERMISSIONS.POS_SESSIONS_MANAGE);
  const [registers, warehouses] = await Promise.all([
    listRegisters(tenant.organizationId),
    listWarehouses(tenant.organizationId),
  ]);
  const warehouseItems: Record<string, string> = Object.fromEntries(warehouses.map((w) => [w.id, w.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Registers" description="Checkout terminals and their session state." />
        {canManageRegisters ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New register</Button>} title="New register" action={upsertRegister}>
            <RegisterFields warehouseItems={warehouseItems} />
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

      {registers.length === 0 ? (
        <EmptyState icon={Store} title="No registers yet" description="Registers you add will appear here." />
      ) : (
        <div className="space-y-3">
          {registers.map((register) => {
            const openSession = register.sessions[0];
            return (
              <div key={register.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{register.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {register.warehouse ? `Deducts from ${register.warehouse.name}` : "No linked warehouse"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={register.active ? "default" : "outline"}>{register.active ? "Active" : "Inactive"}</Badge>
                  {openSession ? (
                    <>
                      <Badge variant="secondary">Session open</Badge>
                      {canManageSessions ? (
                        <EntityDialog
                          trigger={<Button size="sm" variant="ghost">Close session</Button>}
                          title={`Close session on ${register.name}`}
                          action={closeRegisterSession}
                          submitLabel="Close session"
                        >
                          <input type="hidden" name="sessionId" value={openSession.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`closingCash-${register.id}`}>Closing cash count</Label>
                            <Input id={`closingCash-${register.id}`} name="closingCash" type="number" step="0.01" required />
                          </div>
                        </EntityDialog>
                      ) : null}
                    </>
                  ) : (
                    canManageSessions && register.active ? (
                      <EntityDialog
                        trigger={<Button size="sm" variant="ghost">Open session</Button>}
                        title={`Open session on ${register.name}`}
                        action={openRegisterSession}
                        submitLabel="Open session"
                      >
                        <input type="hidden" name="registerId" value={register.id} />
                        <div className="space-y-2">
                          <Label htmlFor={`openingFloat-${register.id}`}>Opening float</Label>
                          <Input id={`openingFloat-${register.id}`} name="openingFloat" type="number" step="0.01" defaultValue="0" required />
                        </div>
                      </EntityDialog>
                    ) : null
                  )}
                  {canManageRegisters ? (
                    <EntityDialog
                      trigger={<Button size="sm" variant="ghost">Edit</Button>}
                      title="Edit register"
                      action={upsertRegister}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={register.id} />
                      <RegisterFields register={register} warehouseItems={warehouseItems} />
                    </EntityDialog>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
