import Link from "next/link";
import { Users, Shapes, Receipt, Library } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getSchoolSummary } from "@/modules/school/service";

export default async function SchoolOverviewPage() {
  const tenant = await requireModuleAccess("school");
  const summary = await getSchoolSummary(tenant.organizationId);
  const stats = [
    { label: "Active students", value: summary.activeStudents, icon: Users, href: "/app/school/students" },
    { label: "Active classes", value: summary.activeClasses, icon: Shapes, href: "/app/school/classes" },
    { label: "Outstanding fees", value: summary.outstanding.toFixed(2), icon: Receipt, href: "/app/school/fees" },
    { label: "Overdue library loans", value: summary.overdueLoans, icon: Library, href: "/app/school/library" },
  ];
  return <div className="space-y-6"><PageHeader title="School Overview" description="Enrollment, attendance, fees, academics, and campus services at a glance." /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map((stat) => <Card key={stat.label}><CardHeader><div className="flex items-center justify-between"><CardDescription>{stat.label}</CardDescription><stat.icon className="size-4 text-muted-foreground" /></div><CardTitle className="text-3xl">{stat.value}</CardTitle></CardHeader><CardContent><Button size="sm" variant="outline" nativeButton={false} render={<Link href={stat.href as never} />}>View</Button></CardContent></Card>)}</div></div>;
}
