import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { getFleetDriverWorkspace } from "@/modules/fleet/service";
import { submitDriverPayment } from "./actions";

export default async function DriverPortalPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) redirect("/app/fleet");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const driver = await getFleetDriverWorkspace(tenant.organizationId, session.user.id);
  if (!driver) return <div className="space-y-6"><PageHeader title="Driver workspace" description="Your fleet self-service workspace." /><p className="rounded-md border p-4 text-sm">Your administrator must link this login to an active driver profile.</p></div>;
  const contracts = driver.assignedVehicles.flatMap((vehicle) => vehicle.workAndPayContracts.map((contract) => ({ ...contract, plateNumber: vehicle.plateNumber })));
  return <div className="space-y-6">
    <PageHeader title="Driver workspace" description="Report maintenance concerns and submit weekly or work-and-pay collections for verification." />
    {saved ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">Submission sent for manager verification.</p> : null}
    {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">The submission could not be saved. Check the details and try again.</p> : null}
    <section className="grid gap-4 md:grid-cols-2">{driver.assignedVehicles.map((vehicle) => <div key={vehicle.id} className="rounded-xl border p-5"><h2 className="font-semibold">{vehicle.plateNumber}</h2><p className="text-sm text-muted-foreground">{vehicle.make} {vehicle.model}</p><p className="mt-2 text-sm">Mileage: {vehicle.mileage ?? "Not recorded"}</p><a className="mt-4 inline-block text-sm text-primary underline" href="/app/fleet/maintenance">Report maintenance concern</a></div>)}</section>
    <section className="rounded-xl border p-5"><h2 className="text-lg font-semibold">Submit a collection</h2><p className="mb-4 text-sm text-muted-foreground">Manager approval is required before this becomes a verified fleet payment.</p>
      <form action={submitDriverPayment} className="grid gap-4 md:grid-cols-2">
        <div><Label htmlFor="vehicleId">Vehicle</Label><select id="vehicleId" name="vehicleId" className="mt-2 h-10 w-full rounded-md border bg-background px-3" required>{driver.assignedVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>)}</select></div>
        <div><Label htmlFor="contractId">Work-and-pay contract</Label><select id="contractId" name="contractId" className="mt-2 h-10 w-full rounded-md border bg-background px-3"><option value="">Weekly payment only</option>{contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractName} ({contract.plateNumber})</option>)}</select></div>
        <div><Label htmlFor="amount">Amount</Label><Input id="amount" name="amount" type="number" min="0.01" step="0.01" required /></div>
        <div><Label htmlFor="paymentDate">Payment date</Label><Input id="paymentDate" name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div>
        <div><Label htmlFor="paymentMethod">Payment method</Label><Input id="paymentMethod" name="paymentMethod" placeholder="Cash, mobile money, bank" required /></div>
        <div><Label htmlFor="reference">Reference</Label><Input id="reference" name="reference" /></div>
        <div className="md:col-span-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" /></div>
        <Button className="md:col-span-2" type="submit">Submit for verification</Button>
      </form>
    </section>
    <section className="rounded-xl border p-5"><h2 className="text-lg font-semibold">Recent submissions</h2><div className="mt-3 space-y-2">{driver.paymentSubmissions.map((item) => <div key={item.id} className="flex items-center justify-between border-b py-2 text-sm"><span>{item.paymentDate.toLocaleDateString()} · {item.amount.toFixed(2)}</span><Badge variant={item.status === "APPROVED" ? "default" : item.status === "REJECTED" ? "destructive" : "outline"}>{item.status}</Badge></div>)}</div></section>
  </div>;
}
