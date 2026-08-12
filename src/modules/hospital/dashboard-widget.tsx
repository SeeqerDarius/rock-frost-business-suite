import Link from "next/link";
import { Hospital } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getHospitalSummary } from "@/modules/hospital/service";

export async function HospitalDashboardWidget() {
  const tenant = await requireModuleAccess("hospital");
  const summary = await getHospitalSummary(tenant.organizationId);
  return <Card><CardHeader><IconBadge size="lg"><Hospital className="size-5" /></IconBadge><CardTitle className="mt-3">Hospital Management</CardTitle><CardDescription>{summary.activePatients} active patients · {summary.admittedCount} admitted · {summary.occupiedBeds}/{summary.totalBeds} beds occupied · {summary.todaysAppointments} appointments today</CardDescription></CardHeader><CardContent><Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/hospital" />}>Open Hospital</Button></CardContent></Card>;
}
