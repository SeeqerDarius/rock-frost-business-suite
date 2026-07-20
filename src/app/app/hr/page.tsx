import Link from "next/link";
import { UsersRound, UserPlus, CalendarClock, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getHrSummary } from "@/modules/hr/service";

export default async function HrOverviewPage() {
  const tenant = await requireCurrentTenant();
  const summary = await getHrSummary(tenant.organizationId);

  const stats = [
    { label: "Active employees", value: summary.activeEmployeeCount, icon: UsersRound, href: "/app/hr/employees" },
    { label: "In onboarding", value: summary.onboardingCount, icon: UserPlus, href: "/app/hr/employees" },
    { label: "Pending leave requests", value: summary.pendingLeaveCount, icon: CalendarClock, href: "/app/hr/leave" },
    { label: "Draft reviews", value: summary.draftReviewCount, icon: ClipboardCheck, href: "/app/hr/reviews" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="HR Overview" description="Headcount, onboarding, leave, and performance review activity at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={stat.href as never} />}>
                View
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
