import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHotelProperties } from "@/modules/hotel/service";
import { createPropertyAction } from "../actions";

export default async function HotelPropertiesPage() {
  const tenant = await requireModuleAccess("hotel"); const properties = await listHotelProperties(tenant.organizationId); const canManage = hasPermission(tenant, PERMISSIONS.HOTEL_PROPERTIES_MANAGE);
  return <div className="space-y-6"><div className="flex items-start justify-between gap-4"><PageHeader title="Properties" description="Hotels, lodges, and serviced properties operated by this organization." />{canManage ? <EntityDialog trigger={<Button size="sm"><Plus />New property</Button>} title="New property" action={createPropertyAction}><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="code">Code</Label><Input id="code" name="code" required /></div><div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div><div><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" /></div><div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" /></div><div><Label htmlFor="timezone">Timezone</Label><Input id="timezone" name="timezone" defaultValue="UTC" required /></div><div><Label htmlFor="currency">Currency</Label><Input id="currency" name="currency" defaultValue="USD" maxLength={3} required /></div></div><div><Label htmlFor="address">Address</Label><Input id="address" name="address" /></div></EntityDialog> : null}</div>{properties.length === 0 ? <EmptyState icon={Building2} title="No properties yet" description="Create the first property before adding room types and rooms." /> : <div className="grid gap-3 md:grid-cols-2">{properties.map((property) => <div key={property.id} className="rounded-lg border p-4"><p className="font-medium">{property.name}</p><p className="text-sm text-muted-foreground">{property.code} · {property._count.rooms} rooms · {property.currency}</p><p className="mt-2 text-sm text-muted-foreground">{property.address || "No address recorded"}</p></div>)}</div>}</div>;
}
