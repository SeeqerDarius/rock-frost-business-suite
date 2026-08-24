import Link from "next/link";
import { Pill } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getPharmacySummary } from "@/modules/pharmacy/service";

export async function PharmacyDashboardWidget({ linkable = true }: { linkable?: boolean } = {}) {
  const tenant = await requireModuleAccess("pharmacy");
  const summary = await getPharmacySummary(tenant.organizationId);
  return <Card><CardHeader><IconBadge size="lg"><Pill className="size-5" /></IconBadge><CardTitle className="mt-3">Pharmacy Management</CardTitle><CardDescription>{summary.medicineCount} medicines · {summary.expiringBatches} batches expiring · {summary.openPrescriptions} open prescriptions</CardDescription></CardHeader>{linkable ? <CardContent><Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/pharmacy" />}>Open Pharmacy</Button></CardContent> : null}</Card>;
}
