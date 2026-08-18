import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/payroll">
      <p className="text-xs font-medium text-muted-foreground">Payroll Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Employees on payroll" value="88" sub="With compensation on file" />
        <StatTile label="Missing compensation" value="6" sub="No compensation on record" />
        <StatTile label="Draft runs" value="1" sub="Not yet finalized" />
        <StatTile label="Last run net pay" value="GH₵142,600" sub="Most recent run" />
      </div>
    </BrowserFrame>
  );
}

function RunPreview() {
  return (
    <BrowserFrame path="/app/payroll/runs">
      <PanelHeader title="Run · 1–31 Aug 2026" badge="Processing" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Employees" value="88" />
        <FieldBox label="Tax deducted" value="Auto-calculated" highlight />
      </div>
      <PanelNote>Each employee&apos;s gross pay and tax deduction are calculated automatically, and a run can&apos;t be processed twice.</PanelNote>
    </BrowserFrame>
  );
}

function CompensationPreview() {
  return (
    <BrowserFrame path="/app/payroll/compensation">
      <PanelHeader title="Compensation coverage" badge="6 missing" />
      <div className="mt-3 text-[11px]">
        <FieldBox label="Notice" value="6 active employees have no compensation on record" />
      </div>
      <PanelNote>Employees without a compensation record are flagged and skipped automatically when a run is processed.</PanelNote>
    </BrowserFrame>
  );
}

export function PayrollModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day payroll processing actually looks like">
      <OverviewPreview />
      <div className="grid gap-4">
        <RunPreview />
        <CompensationPreview />
      </div>
    </ShowcaseSection>
  );
}
