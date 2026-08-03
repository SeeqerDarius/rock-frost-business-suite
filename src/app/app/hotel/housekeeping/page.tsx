import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHotelHousekeepingTasks } from "@/modules/hotel/service";
import { updateHousekeepingAction } from "../actions";

export default async function HousekeepingPage(){const tenant=await requireModuleAccess("hotel");const canManage=hasPermission(tenant,PERMISSIONS.HOTEL_HOUSEKEEPING_MANAGE);const tasks=await listHotelHousekeepingTasks(tenant.organizationId);return <div className="space-y-6"><PageHeader title="Housekeeping" description="Room cleaning, assignment, inspection, and readiness board."/>{tasks.length===0?<EmptyState icon={Sparkles} title="Housekeeping queue is clear" description="Check-out tasks appear automatically."/>:<div className="space-y-3">{tasks.map((task)=><div key={task.id} className="rounded-lg border p-3"><div className="flex justify-between"><div><p className="font-medium">{task.room.property.name} · Room {task.room.number}</p><p className="text-sm text-muted-foreground">{task.assignedTo||"Unassigned"} · {task.priority}</p></div><Badge variant="outline">{task.status.replaceAll("_"," ")}</Badge></div>{canManage&&task.status!=="COMPLETED"?<form action={updateHousekeepingAction} className="mt-3 flex flex-wrap justify-end gap-2"><input type="hidden" name="id" value={task.id}/><Input name="assignedTo" defaultValue={task.assignedTo||""} placeholder="Assigned to" className="w-40"/><select name="status" defaultValue={task.status} className="h-9 rounded-md border bg-transparent px-2 text-sm">{["PENDING","ASSIGNED","IN_PROGRESS","INSPECTION","COMPLETED","BLOCKED"].map((v)=><option key={v}>{v}</option>)}</select><Button size="sm" type="submit">Update</Button></form>:null}</div>)}</div>}</div>}
