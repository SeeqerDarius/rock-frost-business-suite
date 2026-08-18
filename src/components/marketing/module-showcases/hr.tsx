import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/hr">
      <p className="text-xs font-medium text-muted-foreground">HR Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Active employees" value="94" sub="Currently on record" />
        <StatTile label="In onboarding" value="3" sub="Completing onboarding" />
        <StatTile label="Pending leave requests" value="5" sub="Awaiting a decision" />
        <StatTile label="Draft reviews" value="6" sub="Not yet finalized" />
      </div>
    </BrowserFrame>
  );
}

function TerminationPreview() {
  return (
    <BrowserFrame path="/app/hr/terminations">
      <PanelHeader title="Termination · Kojo Asante" badge="Needs a second approver" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Category" value="Resignation" />
        <FieldBox label="Submitted by" value="Nana Yeboah" />
      </div>
      <PanelNote>The person who submits a termination can&apos;t also approve it, a second account has to sign off.</PanelNote>
    </BrowserFrame>
  );
}

function LeavePreview() {
  return (
    <BrowserFrame path="/app/hr/leave">
      <PanelHeader title="Leave · Abena Osei" badge="Pending" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Dates" value="21–25 Sep 2026" />
        <FieldBox label="Days" value="5" highlight />
      </div>
      <PanelNote>Day counts are calculated automatically from the date range as soon as it&apos;s entered.</PanelNote>
    </BrowserFrame>
  );
}

export function HrModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day people operations actually look like">
      <OverviewPreview />
      <div className="grid gap-4">
        <TerminationPreview />
        <LeavePreview />
      </div>
    </ShowcaseSection>
  );
}
