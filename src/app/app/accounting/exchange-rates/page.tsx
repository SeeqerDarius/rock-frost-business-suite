import Link from "next/link";
import { ArrowLeftRight, CheckCircle2, Lock, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { SUPPORTED_CURRENCIES } from "@/lib/localization";
import { createOrganizationFormatter, zonedDateParts } from "@/lib/org-format";
import { listExchangeRates } from "@/modules/globalization/exchange-rates";
import { recordExchangeRateAction } from "./actions";

export const metadata = { title: "Exchange rates" };

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Recording exchange rates requires Accounting settings permission.",
  "same-currency": "Choose a currency other than the base currency.",
  date: "Enter a valid rate date.",
  currency: "Choose a supported ISO 4217 currency.",
  rate: "Enter a rate greater than zero with at most 10 decimal places.",
};

const SELECT_CLASS = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

export default async function ExchangeRatesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; page?: string; currency?: string }> }) {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to this page" description="Exchange rates are visible to roles with Accounting access." />;
  }
  const params = await searchParams;
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE);
  const organization = await db.organization.findUniqueOrThrow({ where: { id: tenant.organizationId }, select: { currency: true, locale: true, timezone: true, dateFormat: true, numberFormat: true } });
  const format = createOrganizationFormatter(organization);
  const page = Math.max(Number.parseInt(params.page ?? "1", 10) || 1, 1);
  const { rows, total, pageSize } = await listExchangeRates(tenant.organizationId, { page, currency: params.currency });
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const todayParts = zonedDateParts(new Date(), organization.timezone);
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const foreignCurrencies = SUPPORTED_CURRENCIES.filter((code) => code !== organization.currency);

  return (
    <div className="space-y-6">
      <PageHeader title="Exchange rates" description={`Dated rates that convert foreign-currency documents into the base currency (${organization.currency}). Each document keeps the rate it was recorded with, so adding or correcting a rate never changes history.`} />

      {params.saved ? <Alert><CheckCircle2 /><AlertTitle>Rate recorded</AlertTitle><AlertDescription>New documents dated on or after the rate date will use it.</AlertDescription></Alert> : null}
      {params.error ? <Alert variant="destructive"><TriangleAlert /><AlertTitle>Rate was not recorded</AlertTitle><AlertDescription>{ERROR_MESSAGES[params.error] ?? ERROR_MESSAGES.rate}</AlertDescription></Alert> : null}

      {canManage ? (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Record a rate</CardTitle>
            <CardDescription>Manual rates are the source of truth today. A live FX provider can be connected later without changing how documents store their rates.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={recordExchangeRateAction} className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="foreignCurrency" required>Foreign currency</Label>
                <select id="foreignCurrency" name="foreignCurrency" required className={SELECT_CLASS} defaultValue={organization.currency === "USD" ? "EUR" : "USD"}>
                  {foreignCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="direction" required>Quote</Label>
                <select id="direction" name="direction" className={SELECT_CLASS} defaultValue="FOREIGN_TO_BASE">
                  <option value="FOREIGN_TO_BASE">1 foreign = x {organization.currency}</option>
                  <option value="BASE_TO_FOREIGN">1 {organization.currency} = x foreign</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rate" required>Rate</Label>
                <Input id="rate" name="rate" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,10})?" placeholder="15.2500" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rateDate" required>Rate date</Label>
                <Input id="rateDate" name="rateDate" type="date" required defaultValue={today} />
              </div>
              <Button type="submit">Record rate</Button>
              <div className="space-y-1.5 md:col-span-5">
                <Label htmlFor="notes">Source or note</Label>
                <Input id="notes" name="notes" maxLength={500} placeholder="e.g. Bank of Ghana interbank mid-rate" />
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Rate history</CardTitle>
            <CardDescription>{total} recorded rate{total === 1 ? "" : "s"}. A later entry for the same date is a correction and applies to new documents only.</CardDescription>
          </div>
          <form className="flex items-end gap-2" method="get">
            <div className="space-y-1.5">
              <Label htmlFor="currency-filter">Currency</Label>
              <select id="currency-filter" name="currency" className={SELECT_CLASS} defaultValue={params.currency ?? ""}>
                <option value="">All</option>
                {foreignCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <Button type="submit" variant="outline" size="sm">Filter</Button>
          </form>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No exchange rates yet" description={`Record a rate before creating documents in a currency other than ${organization.currency}.`} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Rate date</TableHead><TableHead>Pair</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Source</TableHead><TableHead>Recorded by</TableHead><TableHead>Recorded</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{format.date(row.rateDate.toISOString().slice(0, 10) + "T12:00:00Z")}</TableCell>
                    <TableCell className="font-medium">1 {row.fromCurrency} = {row.toCurrency}</TableCell>
                    <TableCell className="text-right tabular-nums">{format.number(row.rate.toString(), { maximumFractionDigits: 10 })}</TableCell>
                    <TableCell><Badge variant="outline">{row.source === "MANUAL" ? "Manual" : row.providerName ?? "Provider"}</Badge>{row.notes ? <span className="ml-2 text-xs text-muted-foreground">{row.notes}</span> : null}</TableCell>
                    <TableCell>{row.createdBy?.name ?? row.createdBy?.email ?? "System"}</TableCell>
                    <TableCell className="text-muted-foreground">{format.dateTime(row.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Page {page} of {pages}</span>
              <div className="flex gap-2">
                {page > 1 ? <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`?page=${page - 1}${params.currency ? `&currency=${params.currency}` : ""}`} />}>Previous</Button> : null}
                {page < pages ? <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`?page=${page + 1}${params.currency ? `&currency=${params.currency}` : ""}`} />}>Next</Button> : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
