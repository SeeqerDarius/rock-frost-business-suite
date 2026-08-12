import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalFacilities, listHospitalDepartments, listHospitalServiceItems, listHospitalProviders, listHospitalWards, listHospitalBeds } from "@/modules/hospital/service";
import { createFacilityAction, createDepartmentAction, createServiceItemAction, createProviderAction, createWardAction, createBedAction } from "../actions";

export default async function HospitalFacilityPage() {
  const tenant = await requireModuleAccess("hospital");
  if (!hasPermission(tenant, PERMISSIONS.HOSPITAL_FACILITY_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Facility" description="Facilities, departments, service catalogue, providers, wards, and beds." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Facility configuration is limited to roles with facility-management permissions." />
      </div>
    );
  }

  const [facilities, departments, serviceItems, providers, wards, beds] = await Promise.all([
    listHospitalFacilities(tenant.organizationId),
    listHospitalDepartments(tenant.organizationId),
    listHospitalServiceItems(tenant.organizationId),
    listHospitalProviders(tenant.organizationId),
    listHospitalWards(tenant.organizationId),
    listHospitalBeds(tenant.organizationId),
  ]);
  const select = (name: string, label: string, options: [string, string][], required = true) => <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required={required} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Facility" description="Facilities, departments, service catalogue, providers, wards, and beds." />
        <EntityDialog trigger={<Button size="sm">New facility</Button>} title="Add facility" action={createFacilityAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="code">Code</Label><Input id="code" name="code" required /></div>
            <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div>
            <div><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" /></div>
            <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" /></div>
            <div><Label htmlFor="timezone">Timezone</Label><Input id="timezone" name="timezone" defaultValue="UTC" required /></div>
            <div><Label htmlFor="currency">Currency</Label><Input id="currency" name="currency" defaultValue="USD" maxLength={3} required /></div>
          </div>
          <div><Label htmlFor="address">Address</Label><Input id="address" name="address" /></div>
        </EntityDialog>
      </div>

      {facilities.length === 0 ? (
        <EmptyState icon={Lock} title="No facilities yet" description="Add a facility before configuring departments, providers, wards, or beds." />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Facilities</CardTitle><CardDescription>{facilities.length} configured</CardDescription></div></CardHeader>
            <CardContent className="space-y-2">{facilities.map((f) => <div key={f.id} className="rounded-md border p-2 text-sm">{f.code} · {f.name}</div>)}</CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Departments</CardTitle><CardDescription>{departments.length} configured</CardDescription></div>
              <EntityDialog trigger={<Button size="sm" variant="outline">Add department</Button>} title="Add department" action={createDepartmentAction}>
                {select("facilityId", "Facility", facilities.map((f) => [f.id, f.name]))}
                <div><Label htmlFor="code">Code</Label><Input id="code" name="code" required /></div>
                <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div>
              </EntityDialog>
            </CardHeader>
            <CardContent className="space-y-2">{departments.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : departments.map((d) => <div key={d.id} className="rounded-md border p-2 text-sm">{d.name} · {d.facility.name}</div>)}</CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Service catalogue</CardTitle><CardDescription>{serviceItems.length} billable services</CardDescription></div>
              <EntityDialog trigger={<Button size="sm" variant="outline">Add service</Button>} title="Add service item" action={createServiceItemAction}>
                {select("facilityId", "Facility", facilities.map((f) => [f.id, f.name]))}
                <div><Label htmlFor="code">Code</Label><Input id="code" name="code" required /></div>
                <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div>
                <div><Label htmlFor="category">Category</Label><Input id="category" name="category" /></div>
                <div><Label htmlFor="price">Price</Label><Input id="price" name="price" type="number" step="0.01" required /></div>
              </EntityDialog>
            </CardHeader>
            <CardContent className="space-y-2">{serviceItems.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : serviceItems.map((s) => <div key={s.id} className="rounded-md border p-2 text-sm">{s.name} · {Number(s.price).toFixed(2)}</div>)}</CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Providers</CardTitle><CardDescription>{providers.length} clinicians</CardDescription></div>
              <EntityDialog trigger={<Button size="sm" variant="outline">Add provider</Button>} title="Add provider" action={createProviderAction}>
                {select("facilityId", "Facility", facilities.map((f) => [f.id, f.name]))}
                {select("departmentId", "Department", departments.map((d) => [d.id, d.name]), false)}
                <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div>
                <div><Label htmlFor="title">Title</Label><Input id="title" name="title" placeholder="Dr., RN…" /></div>
                <div><Label htmlFor="specialty">Specialty</Label><Input id="specialty" name="specialty" /></div>
              </EntityDialog>
            </CardHeader>
            <CardContent className="space-y-2">{providers.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : providers.map((p) => <div key={p.id} className="rounded-md border p-2 text-sm">{p.name}{p.title ? ` (${p.title})` : ""}{p.specialty ? ` · ${p.specialty}` : ""}</div>)}</CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Wards</CardTitle><CardDescription>{wards.length} configured</CardDescription></div>
              <EntityDialog trigger={<Button size="sm" variant="outline">Add ward</Button>} title="Add ward" action={createWardAction}>
                {select("facilityId", "Facility", facilities.map((f) => [f.id, f.name]))}
                <div><Label htmlFor="code">Code</Label><Input id="code" name="code" required /></div>
                <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div>
              </EntityDialog>
            </CardHeader>
            <CardContent className="space-y-2">{wards.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : wards.map((w) => <div key={w.id} className="rounded-md border p-2 text-sm">{w.name} · {w.beds.length} bed{w.beds.length === 1 ? "" : "s"}</div>)}</CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Beds</CardTitle><CardDescription>{beds.length} configured</CardDescription></div>
              <EntityDialog trigger={<Button size="sm" variant="outline">Add bed</Button>} title="Add bed" action={createBedAction}>
                {select("wardId", "Ward", wards.map((w) => [w.id, w.name]))}
                <div><Label htmlFor="code">Bed code</Label><Input id="code" name="code" required /></div>
              </EntityDialog>
            </CardHeader>
            <CardContent className="space-y-2">{beds.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : beds.map((b) => <div key={b.id} className="rounded-md border p-2 text-sm">{b.ward.name} · {b.code} · {b.status}</div>)}</CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
