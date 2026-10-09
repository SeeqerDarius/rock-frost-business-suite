import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createOrganizationFormatter } from "@/lib/org-format";
import { cn } from "@/lib/utils";
import { getContractCalendar } from "@/modules/contracts/lifecycle";
import type { CalendarEventKind } from "@/modules/contracts/rules";
import { actorFromTenant } from "@/modules/contracts/service";

export const metadata = { title: "Contract calendar" };

const KIND_LABEL: Record<CalendarEventKind, string> = { EXPIRATION: "Expiration", RENEWAL: "Renewal", NOTICE_DEADLINE: "Notice deadline", OBLIGATION: "Obligation", MILESTONE: "Milestone" };
const KIND_TAB: Record<CalendarEventKind, string> = { EXPIRATION: "renewals", RENEWAL: "renewals", NOTICE_DEADLINE: "renewals", OBLIGATION: "obligations", MILESTONE: "obligations" };
const KIND_CLASS: Record<CalendarEventKind, string> = {
  EXPIRATION: "border-destructive/50 text-destructive",
  RENEWAL: "border-primary/50 text-primary",
  NOTICE_DEADLINE: "border-amber-500/50 text-amber-700 dark:text-amber-400",
  OBLIGATION: "border-sky-500/50 text-sky-700 dark:text-sky-400",
  MILESTONE: "border-emerald-500/50 text-emerald-700 dark:text-emerald-400",
};

function parseMonth(value: string | undefined) {
  const now = new Date();
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) - 1 : now.getUTCMonth();
  return month >= 0 && month <= 11 && year >= 2000 && year <= 2100 ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const monthKey = (date: Date) => date.toISOString().slice(0, 7);

export default async function ContractCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to contracts" description="Ask an administrator for a Contract Management role." />;
  }
  const search = await searchParams;
  const start = parseMonth(search.month);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const previous = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const events = await getContractCalendar(actor, start, end);
  const format = createOrganizationFormatter(tenant.organization);
  const byDay = new Map<string, typeof events>();
  for (const event of events) {
    const key = event.date.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }
  const monthLabel = new Intl.DateTimeFormat(tenant.organization.locale ?? "en", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Contract calendar" description="Expirations, renewal dates, notice deadlines, obligations, and milestones for approved and active contracts you can access." />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`?month=${monthKey(previous)}`} aria-label="Previous month" />}><ChevronLeft /></Button>
          <span className="min-w-36 text-center text-sm font-medium">{monthLabel}</span>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`?month=${monthKey(end)}`} aria-label="Next month" />}><ChevronRight /></Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">{(Object.keys(KIND_LABEL) as CalendarEventKind[]).map((kind) => <Badge key={kind} variant="outline" className={KIND_CLASS[kind]}>{KIND_LABEL[kind]}</Badge>)}</div>
      {events.length === 0 ? <EmptyState icon={CalendarDays} title="Nothing scheduled this month" description="Dates appear here when contracts have expirations, notice periods, obligations, or milestones." /> : (
        <div className="space-y-3">
          {[...byDay.entries()].map(([day, items]) => (
            <Card key={day}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{format.date(`${day}T12:00:00Z`)}</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">{items.map((event, index) => (
                  <li key={`${event.contractId}-${event.kind}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline" className={KIND_CLASS[event.kind]}>{KIND_LABEL[event.kind]}</Badge>
                    <Link href={`/app/contracts/${event.contractId}?tab=${KIND_TAB[event.kind]}`} className={cn("hover:underline", event.overdue && "font-medium text-destructive")}>{event.title}</Link>
                    <span className="text-xs text-muted-foreground">{event.contractNumber}{event.overdue ? " · overdue" : ""}</span>
                  </li>
                ))}</ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
