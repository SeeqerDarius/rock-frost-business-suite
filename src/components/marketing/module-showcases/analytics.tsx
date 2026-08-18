import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/analytics">
      <p className="text-xs font-medium text-muted-foreground">Analytics Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Total revenue" value="GH₵412,600" sub="Across enabled modules" />
        <StatTile label="Pipeline value" value="GH₵86,000" sub="Open CRM deals" />
        <StatTile label="Stock value" value="GH₵95,300" sub="Fleet and inventory" />
        <StatTile label="Active employees" value="94" sub="On record" />
      </div>
    </BrowserFrame>
  );
}

function FinancialRollupPreview() {
  return (
    <BrowserFrame path="/app/analytics/financial">
      <PanelHeader title="Financial" badge="Accounting + Payroll" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Net income" value="GH₵24,150" />
        <FieldBox label="Outstanding invoices" value="12 · GH₵38,900" />
      </div>
      <PanelNote>Only shows the modules an organization actually has enabled, no blank cards for modules that aren&apos;t in use.</PanelNote>
    </BrowserFrame>
  );
}

function SalesRollupPreview() {
  return (
    <BrowserFrame path="/app/analytics/sales">
      <PanelHeader title="Sales & CRM" badge="Cross-module" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Win rate" value="38%" />
        <FieldBox label="Total collected" value="GH₵194,300" />
      </div>
      <PanelNote>Blends live figures from CRM and Installment Management into one report.</PanelNote>
    </BrowserFrame>
  );
}

export function AnalyticsModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day cross-module reporting actually looks like">
      <OverviewPreview />
      <div className="grid gap-4">
        <FinancialRollupPreview />
        <SalesRollupPreview />
      </div>
    </ShowcaseSection>
  );
}
