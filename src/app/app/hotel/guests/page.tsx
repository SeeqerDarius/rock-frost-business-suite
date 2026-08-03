import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHotelGuests } from "@/modules/hotel/service";
import { createGuestAction } from "../actions";

export default async function HotelGuestsPage() { const tenant = await requireModuleAccess("hotel"); const guests = await listHotelGuests(tenant.organizationId); const canManage = hasPermission(tenant, PERMISSIONS.HOTEL_GUESTS_MANAGE); return <div className="space-y-6"><div className="flex items-start justify-between"><PageHeader title="Guests" description="Guest profiles and contact/identity information." />{canManage ? <EntityDialog trigger={<Button size="sm"><Plus />New guest</Button>} title="New guest" action={createGuestAction}><div className="grid gap-4 sm:grid-cols-2">{[["firstName","First name"],["lastName","Last name"],["email","Email"],["phone","Phone"],["nationality","Nationality"],["identityType","ID type"],["identityNumber","ID number"]].map(([name,label]) => <div key={name}><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={name === "email" ? "email" : "text"} required={name === "firstName" || name === "lastName"} /></div>)}</div><div><Label htmlFor="notes">Notes</Label><Input id="notes" name="notes" /></div></EntityDialog> : null}</div>{guests.length === 0 ? <EmptyState icon={Users} title="No guests yet" description="Guest profiles will appear here." /> : <div className="space-y-2">{guests.map((guest) => <div key={guest.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{guest.firstName} {guest.lastName}</p><p className="text-sm text-muted-foreground">{guest.guestNumber} · {guest.phone || guest.email || "No contact"}</p></div><p className="text-xs text-muted-foreground">{guest.nationality}</p></div>)}</div>}</div>; }
