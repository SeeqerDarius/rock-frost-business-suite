import Link from "next/link";
import { AlertTriangle, ClipboardList, Package, Pill } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getPharmacySummary } from "@/modules/pharmacy/service";

export default async function PharmacyPage() {
  const tenant = await requireModuleAccess("pharmacy");
  const summary = await getPharmacySummary(tenant.organizationId);
  return <div className="space-y-6"><PageHeader title="Pharmacy Overview" description="Medicine safety, batch traceability, prescriptions, dispensing, and operational controls." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><OverviewMetricCard label="Active medicines" value={summary.medicineCount} description="Medicines currently available in the catalogue." icon={<Pill className="size-4" />} /><OverviewMetricCard label="Expiring batches" value={summary.expiringBatches} description="Available batches expiring within 90 days." icon={<AlertTriangle className="size-4" />} /><OverviewMetricCard label="Open prescriptions" value={summary.openPrescriptions} description="Active or partially dispensed prescriptions." icon={<ClipboardList className="size-4" />} /><OverviewMetricCard label="Month dispensing value" value={summary.monthSales.toFixed(2)} description="Completed dispensing value this month." icon={<Package className="size-4" />} /></div><Card><CardHeader><CardTitle>Safe dispensing workflow</CardTitle><CardDescription>Receive traceable batches, validate prescriptions, dispense FEFO stock, and retain restricted-medicine records.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button nativeButton={false} render={<Link href="/app/pharmacy/stock" />}>Receive stock</Button><Button variant="outline" nativeButton={false} render={<Link href="/app/pharmacy/dispensing" />}>Open dispensing</Button><Button variant="outline" nativeButton={false} render={<Link href="/app/pharmacy/reports" />}>Review alerts</Button></CardContent></Card></div>;
}
