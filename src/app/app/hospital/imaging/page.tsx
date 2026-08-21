import { ScanLine, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalImagingOrders, listHospitalImagingTests, listHospitalEncounters, listHospitalPatients } from "@/modules/hospital/service";
import { createImagingTestAction, createImagingOrderAction, scheduleImagingOrderAction, enterImagingFindingAction, verifyImagingFindingAction, rejectImagingFindingAction, correctImagingFindingAction } from "../actions";

export default async function HospitalImagingPage() {
  const tenant = await requireModuleAccess("hospital");
  const canEnter = hasPermission(tenant, PERMISSIONS.HOSPITAL_IMAGING_ENTER);
  const canVerify = hasPermission(tenant, PERMISSIONS.HOSPITAL_IMAGING_VERIFY);
  const canManage = canEnter || canVerify;
  const [orders, tests, encounters, patients] = await Promise.all([
    listHospitalImagingOrders(tenant.organizationId),
    listHospitalImagingTests(tenant.organizationId),
    listHospitalEncounters(tenant.organizationId),
    listHospitalPatients(tenant.organizationId),
  ]);
  const select = (name: string, label: string, options: [string, string][], required = true) => <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required={required} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Imaging" description="Test catalogue, ordering, scheduling, findings, and verification." />
        {canEnter ? (
          <div className="flex gap-2">
            <EntityDialog trigger={<Button size="sm" variant="outline">Add test</Button>} title="Add imaging test" action={createImagingTestAction}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="code">Code</Label><Input id="code" name="code" required /></div>
                <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div>
                <div><Label htmlFor="modality">Modality</Label><Input id="modality" name="modality" placeholder="X-ray, CT, MRI, Ultrasound" required /></div>
                <div><Label htmlFor="price">Price</Label><Input id="price" name="price" type="number" step="0.01" required /></div>
              </div>
            </EntityDialog>
            <EntityDialog trigger={<Button size="sm"><Plus />New order</Button>} title="Order imaging" action={createImagingOrderAction}>
              {select("encounterId", "Encounter", encounters.filter((e) => e.status === "OPEN").map((e) => [e.id, `${e.encounterNumber} · ${e.patient.firstName} ${e.patient.lastName}`]))}
              {select("patientId", "Patient", patients.map((p) => [p.id, `${p.mrn} · ${p.firstName} ${p.lastName}`]))}
              {select("imagingTestId", "Imaging test", tests.map((t) => [t.id, `${t.name} (${t.modality})`]))}
            </EntityDialog>
          </div>
        ) : null}
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={ScanLine} title="No imaging orders yet" description="Ordered studies will appear here." />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const currentFinding = order.findings.find((f) => !order.findings.some((other) => other.supersedesFindingId === f.id));
            return (
              <div key={order.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{order.imagingTest.name} · {order.patient.firstName} {order.patient.lastName}</p>
                    <p className="text-sm text-muted-foreground">Ordered {order.orderedAt.toLocaleString()}{order.scheduledAt ? ` · scheduled ${order.scheduledAt.toLocaleString()}` : ""}{order.externalAccessionNumber ? ` · accession ${order.externalAccessionNumber}` : ""}</p>
                  </div>
                  <Badge variant="outline">{order.status.replaceAll("_", " ")}</Badge>
                </div>
                {currentFinding ? <p className="mt-2 text-sm text-muted-foreground">Findings: {currentFinding.findings}{currentFinding.impression ? `. Impression: ${currentFinding.impression}` : ""}{currentFinding.verifiedAt ? " (verified)" : currentFinding.rejectedAt ? ` (rejected: ${currentFinding.rejectionReason})` : ""}</p> : null}
                {canManage ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canEnter && ["ORDERED", "SCHEDULED"].includes(order.status) ? (
                      <form action={scheduleImagingOrderAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="orderId" value={order.id} />
                        <Input name="scheduledAt" type="datetime-local" required className="h-8 text-xs" />
                        <Input name="externalAccessionNumber" placeholder="Accession #" className="h-8 w-28 text-xs" />
                        <Button size="sm" variant="outline" type="submit">Schedule</Button>
                      </form>
                    ) : null}
                    {canEnter && (!currentFinding || (currentFinding.rejectedAt && !currentFinding.verifiedAt)) ? (
                      <form action={enterImagingFindingAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="orderId" value={order.id} />
                        <Input name="findings" placeholder="Findings" required className="h-8 w-48 text-xs" />
                        <Input name="impression" placeholder="Impression" className="h-8 w-40 text-xs" />
                        <Button size="sm" type="submit">Enter findings</Button>
                      </form>
                    ) : null}
                    {canVerify && currentFinding && !currentFinding.verifiedAt && !currentFinding.rejectedAt ? (
                      <>
                        <form action={verifyImagingFindingAction}><input type="hidden" name="findingId" value={currentFinding.id} /><Button size="sm" type="submit">Verify</Button></form>
                        <form action={rejectImagingFindingAction} className="flex items-end gap-2">
                          <input type="hidden" name="findingId" value={currentFinding.id} />
                          <Input name="reason" placeholder="Rejection reason" required className="h-8 w-32 text-xs" />
                          <Button size="sm" variant="outline" type="submit">Reject</Button>
                        </form>
                      </>
                    ) : null}
                    {canEnter && currentFinding?.verifiedAt ? (
                      <form action={correctImagingFindingAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="priorFindingId" value={currentFinding.id} />
                        <Input name="findings" placeholder="Corrected findings" required className="h-8 w-48 text-xs" />
                        <Input name="impression" placeholder="Impression" className="h-8 w-40 text-xs" />
                        <Input name="correctionReason" placeholder="Reason" required className="h-8 w-32 text-xs" />
                        <Button size="sm" variant="outline" type="submit">Submit correction</Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
