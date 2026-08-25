import { Building2, Plus, DoorOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHostelBuildings, listHostelRooms } from "@/modules/hostel/service";
import { listSchoolCampuses } from "@/modules/school/service";
import { createBuildingAction, updateBuildingAction, createRoomAction } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage hostel buildings.",
  invalid: "All required fields must be filled in correctly.",
  "not-found": "That building or room could not be found.",
};

export default async function HostelBuildingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("hostel");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSTEL_BUILDINGS_MANAGE);
  const [buildings, rooms, campuses] = await Promise.all([
    listHostelBuildings(tenant.organizationId),
    listHostelRooms(tenant.organizationId),
    listSchoolCampuses(tenant.organizationId),
  ]);
  const campusOptions = campuses.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Buildings & Rooms" description="Hostel buildings, their rooms, and bed capacity." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New building</Button>} title="New hostel building" action={createBuildingAction}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="code">Code</Label><Input id="code" name="code" required /></div>
              <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" placeholder="Boys' Hostel A" required /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campusId">Campus</Label>
                <select id="campusId" name="campusId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" defaultValue="">
                  <option value="">No specific campus</option>
                  {campusOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="genderPolicy">Gender policy</Label>
                <select id="genderPolicy" name="genderPolicy" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" defaultValue="">
                  <option value="">No policy</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="address">Address</Label><Textarea id="address" name="address" rows={2} /></div>
          </EntityDialog>
        ) : null}
      </div>

      {saved ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Saved.</div> : null}
      {error && ERROR_MESSAGES[error] ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERROR_MESSAGES[error]}</div> : null}

      {buildings.length === 0 ? (
        <EmptyState icon={Building2} title="No hostel buildings yet" description="Add a building to start setting up rooms and beds." />
      ) : (
        <div className="space-y-6">
          {buildings.map((building) => {
            const buildingRooms = rooms.filter((r) => r.building.id === building.id);
            return (
              <div key={building.id} className="space-y-4 rounded-xl border p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold">{building.name}</h2>
                      <Badge variant={building.active ? "default" : "secondary"}>{building.active ? "Active" : "Inactive"}</Badge>
                      {building.genderPolicy ? <Badge variant="outline">{building.genderPolicy}</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">Code {building.code}{building.campus ? ` · ${building.campus.name}` : ""} · {building._count.rooms} room{building._count.rooms === 1 ? "" : "s"} · {building._count.wardens} warden{building._count.wardens === 1 ? "" : "s"}</p>
                  </div>
                  {canManage ? (
                    <div className="flex gap-2">
                      <EntityDialog trigger={<Button size="sm" variant="outline">Edit</Button>} title={`Edit ${building.name}`} action={updateBuildingAction} submitLabel="Save changes">
                        <input type="hidden" name="id" value={building.id} />
                        <div className="space-y-2"><Label htmlFor={`name-${building.id}`}>Name</Label><Input id={`name-${building.id}`} name="name" defaultValue={building.name} required /></div>
                        <div className="space-y-2">
                          <Label htmlFor={`gender-${building.id}`}>Gender policy</Label>
                          <select id={`gender-${building.id}`} name="genderPolicy" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" defaultValue={building.genderPolicy ?? ""}>
                            <option value="">No policy</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Mixed">Mixed</option>
                          </select>
                        </div>
                        <div className="space-y-2"><Label htmlFor={`address-${building.id}`}>Address</Label><Textarea id={`address-${building.id}`} name="address" rows={2} defaultValue={building.address ?? ""} /></div>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={building.active} />Active</label>
                      </EntityDialog>
                      <EntityDialog trigger={<Button size="sm" variant="outline"><Plus />Room</Button>} title={`Add a room to ${building.name}`} description="Beds are created automatically, labeled A, B, C..." action={createRoomAction} submitLabel="Add room">
                        <input type="hidden" name="buildingId" value={building.id} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2"><Label htmlFor={`room-number-${building.id}`}>Room number</Label><Input id={`room-number-${building.id}`} name="roomNumber" required /></div>
                          <div className="space-y-2"><Label htmlFor={`floor-${building.id}`}>Floor</Label><Input id={`floor-${building.id}`} name="floor" /></div>
                        </div>
                        <div className="space-y-2"><Label htmlFor={`capacity-${building.id}`}>Bed capacity</Label><Input id={`capacity-${building.id}`} name="capacity" type="number" min="1" max="20" required /></div>
                      </EntityDialog>
                    </div>
                  ) : null}
                </div>

                {buildingRooms.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {buildingRooms.map((room) => (
                      <div key={room.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <p className="flex items-center gap-1.5 text-sm font-medium"><DoorOpen className="size-4 text-muted-foreground" />Room {room.roomNumber}{room.floor ? ` · Floor ${room.floor}` : ""}</p>
                          <Badge variant={room.active ? "outline" : "secondary"}>{room.beds.filter((b) => b.status === "OCCUPIED").length}/{room.beds.length} occupied</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {room.beds.map((bed) => (
                            <span key={bed.id} className={`rounded px-1.5 py-0.5 text-xs ${bed.status === "OCCUPIED" ? "bg-primary/10 text-primary" : bed.status === "MAINTENANCE" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                              {bed.label}{bed.allocations[0] ? `: ${bed.allocations[0].student.firstName} ${bed.allocations[0].student.lastName}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No rooms yet in this building.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
