import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getSchoolSummary } from "@/modules/school/service";

export async function SchoolDashboardWidget() {
  const tenant = await requireModuleAccess("school");
  const summary = await getSchoolSummary(tenant.organizationId);
  return <Card><CardHeader><IconBadge size="lg"><GraduationCap className="size-5" /></IconBadge><CardTitle className="mt-3">School Management</CardTitle><CardDescription>{summary.activeStudents} active students · {summary.activeClasses} classes · {summary.overdueLoans} overdue library loans</CardDescription></CardHeader><CardContent><Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/school" />}>Open School</Button></CardContent></Card>;
}
