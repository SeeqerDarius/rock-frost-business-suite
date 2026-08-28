import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/pharmacy">
      <p className="text-xs font-medium text-muted-foreground">Pharmacy Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Active medicines" value="416" sub="In the catalogue" />
        <StatTile label="Expiring batches" value="11" sub="Within 90 days" />
        <StatTile label="Open prescriptions" value="28" sub="Active or partial" />
        <StatTile label="Month dispensing value" value="GH₵62,800" sub="Completed this month" />
      </div>
    </BrowserFrame>
  );
}

function DispensingPreview() {
  return (
    <BrowserFrame path="/app/pharmacy/dispensing">
      <PanelHeader title="Amoxicillin 500mg" badge="FEFO batch selected" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Batch" value="Expires soonest, non-expired" />
        <FieldBox label="Prescription" value="Matched to patient" highlight />
      </div>
      <PanelNote>Stock is drawn from the earliest-expiring available batch, expired, quarantined, or recalled batches are excluded automatically.</PanelNote>
    </BrowserFrame>
  );
}

function RestrictedRegisterPreview() {
  return (
    <BrowserFrame path="/app/pharmacy/restricted">
      <PanelHeader title="Restricted Medicines Register" badge="Append-only" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Entry" value="Logged automatically on dispense" />
        <FieldBox label="Correction" value="Linked reversal" />
      </div>
      <PanelNote>Controlled-medicine entries are recorded automatically and can never be edited, only reversed with a linked entry.</PanelNote>
    </BrowserFrame>
  );
}

export function PharmacyModuleShowcase({ reverse }: { reverse?: boolean } = {}) {
  return (
    <ShowcaseSection title="What day-to-day dispensing actually looks like" reverse={reverse}>
      <OverviewPreview />
      <div className="grid gap-4">
        <DispensingPreview />
        <RestrictedRegisterPreview />
      </div>
    </ShowcaseSection>
  );
}
