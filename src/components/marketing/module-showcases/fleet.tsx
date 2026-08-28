import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/fleet">
      <p className="text-xs font-medium text-muted-foreground">Fleet Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Vehicles" value="58" sub="Registered in the fleet" />
        <StatTile label="Active drivers" value="52" sub="Assigned to vehicles" />
        <StatTile label="Pending maintenance" value="4" sub="Awaiting action" />
        <StatTile label="Work & pay contracts" value="19" sub="Currently in effect" />
      </div>
    </BrowserFrame>
  );
}

function MaintenancePreview() {
  return (
    <BrowserFrame path="/app/fleet/maintenance">
      <PanelHeader title="GT-4471-20 · Fault report" badge="Awaiting owner approval" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Fault" value="Brake pads worn" />
        <FieldBox label="Manager review" value="Approved" highlight />
      </div>
      <PanelNote>Owner approval unlocks only after manager review. A mechanic can&apos;t be assigned until both are approved.</PanelNote>
    </BrowserFrame>
  );
}

function WorkAndPayPreview() {
  return (
    <BrowserFrame path="/app/fleet/work-and-pay">
      <PanelHeader title="Contract · Kwabena Owusu" badge="64% complete" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Weekly amount" value="GH₵450" />
        <FieldBox label="Amount paid" value="GH₵28,800 / 45,000" />
      </div>
      <PanelNote>Completion percentage updates automatically as weekly payments are recorded.</PanelNote>
    </BrowserFrame>
  );
}

export function FleetModuleShowcase({ reverse }: { reverse?: boolean } = {}) {
  return (
    <ShowcaseSection title="What day-to-day fleet operations actually look like" reverse={reverse}>
      <OverviewPreview />
      <div className="grid gap-4">
        <MaintenancePreview />
        <WorkAndPayPreview />
      </div>
    </ShowcaseSection>
  );
}
