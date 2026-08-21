import { FlaskConical, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalLabOrders, listHospitalLabTests, listHospitalEncounters, listHospitalPatients } from "@/modules/hospital/service";
import { createLabTestAction, createLabOrderAction, collectSpecimenAction, enterLabResultAction, verifyLabResultAction, rejectLabResultAction, correctLabResultAction } from "../actions";

export default async function HospitalLaboratoryPage() {
  const tenant = await requireModuleAccess("hospital");
  const canEnter = hasPermission(tenant, PERMISSIONS.HOSPITAL_LAB_ENTER);
  const canVerify = hasPermission(tenant, PERMISSIONS.HOSPITAL_LAB_VERIFY);
  const canManage = canEnter || canVerify;
  const [orders, tests, encounters, patients] = await Promise.all([
    listHospitalLabOrders(tenant.organizationId),
    listHospitalLabTests(tenant.organizationId),
    listHospitalEncounters(tenant.organizationId),
    listHospitalPatients(tenant.organizationId),
  ]);
  const select = (name: string, label: string, options: [string, string][], required = true) => <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required={required} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Laboratory" description="Test catalogue, orders, specimens, results, and verification." />
        {canEnter ? (
          <div className="flex gap-2">
            <EntityDialog trigger={<Button size="sm" variant="outline">Add test</Button>} title="Add lab test" action={createLabTestAction}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="code">Code</Label><Input id="code" name="code" required /></div>
                <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div>
                <div><Label htmlFor="specimenType">Specimen type</Label><Input id="specimenType" name="specimenType" /></div>
                <div><Label htmlFor="price">Price</Label><Input id="price" name="price" type="number" step="0.01" required /></div>
              </div>
            </EntityDialog>
            <EntityDialog trigger={<Button size="sm"><Plus />New order</Button>} title="Order lab tests" action={createLabOrderAction}>
              {select("encounterId", "Encounter", encounters.filter((e) => e.status === "OPEN").map((e) => [e.id, `${e.encounterNumber} · ${e.patient.firstName} ${e.patient.lastName}`]))}
              {select("patientId", "Patient", patients.map((p) => [p.id, `${p.mrn} · ${p.firstName} ${p.lastName}`]))}
              <div><Label>Tests</Label><div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">{tests.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="testIds" value={t.id} className="size-4" />{t.name}</label>)}</div></div>
            </EntityDialog>
          </div>
        ) : null}
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={FlaskConical} title="No lab orders yet" description="Ordered tests will appear here." />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border p-4">
              <p className="font-medium">{order.patient.firstName} {order.patient.lastName} · ordered {order.orderedAt.toLocaleString()}</p>
              <div className="mt-2 space-y-2">
                {order.items.map((item) => {
                  const currentResult = item.results.find((r) => !item.results.some((other) => other.supersedesResultId === r.id));
                  return (
                    <div key={item.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{item.labTest.name}</p>
                        <Badge variant="outline">{item.status.replaceAll("_", " ")}</Badge>
                      </div>
                      {currentResult ? (
                        <p className="mt-1 text-sm text-muted-foreground">{currentResult.value} {currentResult.unit ?? ""} ({currentResult.abnormalFlag}){currentResult.verifiedAt ? " · verified" : currentResult.rejectedAt ? ` · rejected: ${currentResult.rejectionReason}` : ""}</p>
                      ) : null}
                      {canManage ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {canEnter && item.status === "ORDERED" ? <form action={collectSpecimenAction}><input type="hidden" name="itemId" value={item.id} /><Button size="sm" variant="outline" type="submit">Mark specimen collected</Button></form> : null}
                          {canEnter && ["SPECIMEN_COLLECTED", "IN_PROGRESS"].includes(item.status) ? (
                            <form action={enterLabResultAction} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="itemId" value={item.id} />
                              <Input name="value" placeholder="Value" required className="h-8 w-24 text-xs" />
                              <Input name="unit" placeholder="Unit" className="h-8 w-16 text-xs" />
                              <select name="abnormalFlag" className="h-8 rounded-md border bg-transparent px-2 text-xs"><option value="NORMAL">Normal</option><option value="LOW">Low</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select>
                              <Button size="sm" type="submit">Enter result</Button>
                            </form>
                          ) : null}
                          {canVerify && item.status === "RESULTED" && currentResult && !currentResult.verifiedAt ? (
                            <>
                              <form action={verifyLabResultAction}><input type="hidden" name="resultId" value={currentResult.id} /><Button size="sm" type="submit">Verify result</Button></form>
                              <form action={rejectLabResultAction} className="flex items-end gap-2">
                                <input type="hidden" name="resultId" value={currentResult.id} />
                                <Input name="reason" placeholder="Rejection reason" required className="h-8 w-32 text-xs" />
                                <Button size="sm" variant="outline" type="submit">Reject</Button>
                              </form>
                            </>
                          ) : null}
                          {canEnter && currentResult?.verifiedAt ? (
                            <form action={correctLabResultAction} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="priorResultId" value={currentResult.id} />
                              <Input name="value" placeholder="Corrected value" required className="h-8 w-24 text-xs" />
                              <Input name="unit" placeholder="Unit" className="h-8 w-16 text-xs" />
                              <select name="abnormalFlag" className="h-8 rounded-md border bg-transparent px-2 text-xs"><option value="NORMAL">Normal</option><option value="LOW">Low</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select>
                              <Input name="correctionReason" placeholder="Correction reason" required className="h-8 w-32 text-xs" />
                              <Button size="sm" variant="outline" type="submit">Submit correction</Button>
                            </form>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
