import { Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHotelHousekeepingTasks, listHotelRooms } from "@/modules/hotel/service";
import { createHousekeepingTaskAction, updateHousekeepingAction } from "../actions";

export default async function HousekeepingPage() {
  const tenant = await requireModuleAccess("hotel");
  const canManage = hasPermission(tenant, PERMISSIONS.HOTEL_HOUSEKEEPING_MANAGE);
  const [tasks, rooms] = await Promise.all([listHotelHousekeepingTasks(tenant.organizationId), listHotelRooms(tenant.organizationId)]);
  const eligibleRooms = rooms.filter((room) => room.active && room.status !== "OUT_OF_SERVICE");

  const newTask = canManage && eligibleRooms.length ? (
    <EntityDialog trigger={<Button size="sm"><Plus />New task</Button>} title="New housekeeping task" action={createHousekeepingTaskAction}>
      <div className="space-y-1.5"><Label htmlFor="roomId">Room</Label><select id="roomId" name="roomId" required className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">{eligibleRooms.map((room) => <option key={room.id} value={room.id}>{room.property.name} · Room {room.number} · {room.status.replaceAll("_", " ")}</option>)}</select></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="assignedTo">Assigned to</Label><Input id="assignedTo" name="assignedTo" /></div>
        <div className="space-y-1.5"><Label htmlFor="priority">Priority</Label><select id="priority" name="priority" defaultValue="NORMAL" className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">{["LOW", "NORMAL", "HIGH", "CHECKOUT", "URGENT"].map((value) => <option key={value}>{value}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="dueAt">Due at</Label><Input id="dueAt" name="dueAt" type="datetime-local" /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" /></div>
    </EntityDialog>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Housekeeping" description="Room cleaning, assignment, inspection, and readiness board." actions={newTask} />
      {tasks.length === 0 ? <EmptyState icon={Sparkles} title="Housekeeping queue is clear" description="Checkout tasks appear automatically when enabled, or use New task to create one manually." /> : (
        <div className="space-y-3">{tasks.map((task) => <div key={task.id} className="rounded-lg border p-3"><div className="flex justify-between"><div><p className="font-medium">{task.room.property.name} · Room {task.room.number}</p><p className="text-sm text-muted-foreground">{task.assignedTo || "Unassigned"} · {task.priority}{task.dueAt ? ` · Due ${task.dueAt.toLocaleString("en-GH")}` : ""}</p></div><Badge variant="outline">{task.status.replaceAll("_", " ")}</Badge></div>{canManage && task.status !== "COMPLETED" ? <form action={updateHousekeepingAction} className="mt-3 flex flex-wrap justify-end gap-2"><input type="hidden" name="id" value={task.id} /><Input name="assignedTo" defaultValue={task.assignedTo || ""} placeholder="Assigned to" className="w-40" /><select name="status" defaultValue={task.status} className="h-9 rounded-md border bg-transparent px-2 text-sm">{["PENDING", "ASSIGNED", "IN_PROGRESS", "INSPECTION", "COMPLETED", "BLOCKED"].map((value) => <option key={value}>{value}</option>)}</select><Button size="sm" type="submit">Update</Button></form> : null}</div>)}</div>
      )}
    </div>
  );
}
