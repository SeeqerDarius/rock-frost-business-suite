import Link from "next/link";
import { Download, FileBarChart, Info, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { createOrganizationFormatter, zonedDateParts } from "@/lib/org-format";
import { cn } from "@/lib/utils";
import { getExemptionReport, getTaxLiabilitiesByClass, getTaxReport, type TaxReportView, getOssReturn } from "@/modules/tax/reports";

export const metadata = { title: "Tax reports" };

const VIEWS: { key: TaxReportView | "exemptions" | "liabilities" | "oss"; label: string; description: string }[] = [
  { key: "jurisdiction", label: "By jurisdiction", description: "Taxable, exempt, zero-rated, and non-taxable sales with tax collected and input tax for each jurisdiction (state, county, city, member state, or country)." },
  { key: "level", label: "By level", description: "Totals by jurisdiction level, for example state, county, and city sales tax." },
  { key: "kind", label: "By tax kind", description: "VAT, sales tax, use tax, levies, and excise kept apart." },
  { key: "authority", label: "By authority", description: "Totals by the tax authority each rate belongs to." },
  { key: "period", label: "By month", description: "Tax liability by month in the organization timezone." },
  { key: "exemptions", label: "Customer exemptions", description: "Exempt sales by customer with the certificates on file." },
  { key: "oss", label: "OSS return", description: "One-Stop-Shop worksheet: B2C supplies taxed at another member state's VAT rate, by member state of consumption and rate. Use it to complete the quarterly OSS return in your member state of identification's portal; settled credit notes appear as negative amounts in the period they post, and corrections to a previously filed quarter must be declared in that quarter's correction section." },
  { key: "liabilities", label: "Liabilities by class", description: "Ledger balances for sales tax, VAT and levies, payroll and employment taxes, income tax, excise, and withholding, kept separate." },
];

function isDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function TaxReportsPage({ searchParams }: { searchParams: Promise<{ view?: string; from?: string; to?: string }> }) {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to this page" description="Tax reports require Accounting report access." />;
  }
  const params = await searchParams;
  const organization = await db.organization.findUniqueOrThrow({ where: { id: tenant.organizationId }, select: { currency: true, locale: true, timezone: true, dateFormat: true, numberFormat: true } });
  const format = createOrganizationFormatter(organization);
  const today = zonedDateParts(new Date(), organization.timezone);
  const from = isDate(params.from) ? params.from : `${today.year}-${today.month}-01`;
  const to = isDate(params.to) ? params.to : `${today.year}-${today.month}-${today.day}`;
  const view = VIEWS.find((item) => item.key === params.view) ?? VIEWS[0];
  const money = (value: { toString(): string } | number) => format.money(value.toString());
  const query = (extra: Record<string, string>) => new URLSearchParams({ from, to, view: view.key, ...extra }).toString();

  const oss = view.key === "oss" ? await getOssReturn(tenant.organizationId, { from, to }) : null;
  const quarterStart = (offset: number) => { const month = Math.floor((Number(today.month) - 1) / 3) * 3 + offset * 3; const date = new Date(Date.UTC(Number(today.year), month, 1)); return date; };
  const quarterLink = (offset: number) => { const startDate = quarterStart(offset); const endDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 3, 0)); return { label: `Q${Math.floor(startDate.getUTCMonth() / 3) + 1} ${startDate.getUTCFullYear()}`, href: `?${new URLSearchParams({ view: "oss", from: startDate.toISOString().slice(0, 10), to: endDate.toISOString().slice(0, 10) }).toString()}` }; };
  const report = view.key !== "exemptions" && view.key !== "liabilities" && view.key !== "oss" ? await getTaxReport(tenant.organizationId, { from, to, view: view.key }) : null;
  const exemptions = view.key === "exemptions" ? await getExemptionReport(tenant.organizationId, { from, to }) : null;
  const liabilities = view.key === "liabilities" ? await getTaxLiabilitiesByClass(tenant.organizationId, to) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Tax reports" description={`Working tax reports from posted documents, in ${organization.currency}. Periods use the organization timezone (${organization.timezone.replaceAll("_", " ")}). Use them to review and prepare filings; Rock Frost does not file returns.`} />

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="view" value={view.key} />
            <div className="space-y-1.5"><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" defaultValue={from} required /></div>
            <div className="space-y-1.5"><Label htmlFor="to">To</Label><Input id="to" name="to" type="date" defaultValue={to} required /></div>
            <Button type="submit" variant="outline">Apply</Button>
            {view.key !== "liabilities" ? <Button variant="ghost" nativeButton={false} render={<a href={`/app/accounting/tax-reports/export?${query({})}`} />}><Download />Export CSV</Button> : null}
          </form>
        </CardContent>
      </Card>

      <nav aria-label="Report views" className="flex flex-wrap gap-1 border-b">
        {VIEWS.map((item) => (
          <Link key={item.key} href={`?${new URLSearchParams({ from, to, view: item.key }).toString()}`} aria-current={item.key === view.key ? "page" : undefined} className={cn("rounded-t-md px-3 py-2 text-sm", item.key === view.key ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{item.label}</Link>
        ))}
      </nav>

      <Card>
        <CardHeader><CardTitle>{view.label}</CardTitle><CardDescription>{view.description}</CardDescription></CardHeader>
        <CardContent>
          {report ? (
            report.rows.length === 0 ? <EmptyState icon={FileBarChart} title="No posted tax activity in this period" description="Reports include invoices and bills once they are sent or approved." /> : (
              <>
                {report.truncated ? <Alert className="mb-4"><Info /><AlertDescription>This period has more than 50,000 tax entries; narrow the dates for complete totals.</AlertDescription></Alert> : null}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{view.key === "period" ? "Month" : view.key === "kind" ? "Tax kind" : view.key === "authority" ? "Authority" : view.key === "level" ? "Level" : "Jurisdiction"}</TableHead>
                        <TableHead className="text-right">Taxable sales</TableHead>
                        <TableHead className="text-right">Zero-rated</TableHead>
                        <TableHead className="text-right">Exempt</TableHead>
                        <TableHead className="text-right">Non-taxable</TableHead>
                        <TableHead className="text-right">Reverse charge</TableHead>
                        <TableHead className="text-right">Tax collected</TableHead>
                        <TableHead className="text-right">Input tax</TableHead>
                        <TableHead className="text-right">Self-assessed</TableHead>
                        <TableHead className="text-right">Adjustments</TableHead>
                        <TableHead className="text-right">Net payable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...report.rows, report.totals].map((row) => (
                        <TableRow key={row.key} className={row.key === "TOTAL" ? "border-t-2 font-semibold" : ""}>
                          <TableCell><div className={row.key === "TOTAL" ? "" : "font-medium"}>{row.label}</div>{row.level && view.key === "jurisdiction" ? <div className="text-xs text-muted-foreground">{row.level.toLowerCase()}</div> : null}</TableCell>
                          {[row.taxableSales, row.zeroRatedSales, row.exemptSales, row.nonTaxableSales, row.reverseChargeSales, row.taxCollected, row.inputTax, row.selfAssessed, row.adjustments, row.netPayable].map((amount, index) => <TableCell key={index} className="text-right tabular-nums">{money(amount)}</TableCell>)}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Net payable = tax collected + adjustments - recoverable input tax (VAT, GST, and levies). Sales and use tax paid on purchases is part of cost and is not deducted. {report.entryCount} tax entries.</p>
              </>
            )
          ) : null}

          {exemptions ? (
            exemptions.length === 0 ? <EmptyState icon={FileBarChart} title="No exempt sales in this period" description="Sales to customers with a valid exemption appear here once invoices are sent." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Certificates on file</TableHead><TableHead>Documents</TableHead><TableHead className="text-right">Exempt sales</TableHead></TableRow></TableHeader>
                <TableBody>{exemptions.map((row) => <TableRow key={row.contactId ?? row.customer}><TableCell className="font-medium">{row.customer}</TableCell><TableCell className="text-sm">{row.certificates.join("; ") || "None recorded"}</TableCell><TableCell className="text-xs">{row.documents.join(", ")}</TableCell><TableCell className="text-right tabular-nums">{money(row.exemptSales)}</TableCell></TableRow>)}</TableBody>
              </Table>
            )
          ) : null}

          {oss ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">{[-1, 0].map((offset) => { const link = quarterLink(offset); return <Link key={link.label} href={link.href} className="rounded-md border px-3 py-1 hover:bg-muted">{link.label}</Link>; })}</div>
              {!oss.established ? <p className="text-sm text-muted-foreground">The OSS return applies to organizations established in an EU member state. Set the organization&apos;s tax jurisdiction to its member state (for example EU-DE) in Localization and apply the EU pack in Tax and Compliance.</p> : oss.rows.length === 0 ? <EmptyState icon={FileBarChart} title="No OSS supplies in this period" description="Invoices taxed with an OSS B2C rule for another member state appear here once they are sent." /> : (
                <>
                  {oss.baseCurrency !== "EUR" ? <p className="text-sm text-muted-foreground">Amounts are in {oss.baseCurrency}. OSS returns are declared in euro; convert using the European Central Bank rate on the last day of the quarter.</p> : null}
                  <Table>
                    <TableHeader><TableRow><TableHead>Member state of consumption</TableHead><TableHead className="text-right">VAT rate</TableHead><TableHead className="text-right">Taxable amount</TableHead><TableHead className="text-right">VAT</TableHead><TableHead className="text-right">Documents</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {oss.rows.map((row) => <TableRow key={`${row.memberState}-${row.rate.toString()}`}><TableCell className="font-medium">{row.memberState}</TableCell><TableCell className="text-right tabular-nums">{row.rate.toString()}%</TableCell><TableCell className="text-right tabular-nums">{money(row.taxableAmount)}</TableCell><TableCell className="text-right tabular-nums">{money(row.vatAmount)}</TableCell><TableCell className="text-right tabular-nums">{row.documents}</TableCell></TableRow>)}
                      <TableRow><TableCell className="font-semibold" colSpan={3}>Total VAT due under OSS</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(oss.totalVat)}</TableCell><TableCell /></TableRow>
                    </TableBody>
                  </Table>
                </>
              )}
            </div>
          ) : null}

          {liabilities ? (
            liabilities.length === 0 ? <EmptyState icon={FileBarChart} title="No tax accounts yet" description="Tax liability accounts appear once documents post or a jurisdiction pack provisions them." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Class</TableHead><TableHead>Accounts</TableHead><TableHead className="text-right">Balance at {format.date(`${to}T12:00:00Z`)}</TableHead></TableRow></TableHeader>
                <TableBody>{liabilities.map((klass) => <TableRow key={klass.key}><TableCell className="font-medium">{klass.label}</TableCell><TableCell className="text-xs text-muted-foreground">{klass.accounts.map((account) => `${account.code} ${account.name}`).join(", ")}</TableCell><TableCell className="text-right tabular-nums">{money(klass.balance)}</TableCell></TableRow>)}</TableBody>
              </Table>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
