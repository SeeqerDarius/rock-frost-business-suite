import { BedDouble, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listHotelProperties, listHotelRooms, listHotelRoomTypes } from "@/modules/hotel/service";
import { createRoomAction, createRoomTypeAction } from "../actions";

export default async function HotelRoomsPage() {
  const tenant = await requireModuleAccess("hotel"); const canManage = hasPermission(tenant, PERMISSIONS.HOTEL_ROOMS_MANAGE); const [properties, types, rooms] = await Promise.all([listHotelProperties(tenant.organizationId), listHotelRoomTypes(tenant.organizationId), listHotelRooms(tenant.organizationId)]);
  return <div className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title="Rooms" description="Room inventory, types, rates, capacity, and operational status." />{canManage ? <div className="flex gap-2"><EntityDialog trigger={<Button size="sm" variant="outline"><Plus />Room type</Button>} title="New room type" action={createRoomTypeAction}><SelectField name="propertyId" label="Property" options={properties.map((p) => [p.id, p.name])} /><div className="grid gap-4 sm:grid-cols-2"><TextField name="code" label="Code" /><TextField name="name" label="Name" /><TextField name="capacity" label="Capacity" type="number" defaultValue="2" /><TextField name="baseRate" label={`Base nightly rate (${tenant.organization.currency ?? "GHS"})`} type="number" /></div><TextField name="description" label="Description" /></EntityDialog><EntityDialog trigger={<Button size="sm"><Plus />Room</Button>} title="New room" action={createRoomAction}><SelectField name="propertyId" label="Property" options={properties.map((p) => [p.id, p.name])} /><SelectField name="roomTypeId" label="Room type" options={types.map((t) => [t.id, `${t.property.name} · ${t.name}`])} /><div className="grid gap-4 sm:grid-cols-2"><TextField name="number" label="Room number" /><TextField name="floor" label="Floor" required={false} /></div></EntityDialog></div> : null}</div>{rooms.length === 0 ? <EmptyState icon={BedDouble} title="No rooms yet" description="Create a room type and room to start accepting reservations." /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rooms.map((room) => <div key={room.id} className="rounded-lg border p-4"><div className="flex justify-between"><p className="font-medium">{room.property.name} · {room.number}</p><Badge variant="outline">{room.status.replaceAll("_", " ")}</Badge></div><p className="text-sm text-muted-foreground">{room.roomType.name} · {formatMoney(room.roomType.baseRate, tenant.organization.currency)} · capacity {room.roomType.capacity}</p></div>)}</div>}</div>;
}

function TextField({ name, label, type = "text", defaultValue, required = true }: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean }) { return <div><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} step={type === "number" ? "0.01" : undefined} /></div>; }
function SelectField({ name, label, options }: { name: string; label: string; options: [string, string][] }) { return <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>; }
