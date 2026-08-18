import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/hotel">
      <p className="text-xs font-medium text-muted-foreground">Hotel Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Occupied rooms" value="34 / 48" sub="Current utilization" />
        <StatTile label="In-house guests" value="41" sub="Checked-in stays" />
        <StatTile label="Open folios" value="34" sub="Awaiting settlement" />
        <StatTile label="Housekeeping queue" value="9" sub="Rooms needing attention" />
      </div>
    </BrowserFrame>
  );
}

function ReservationPreview() {
  return (
    <BrowserFrame path="/app/hotel/reservations">
      <PanelHeader title="Room 214 · 20–23 Aug 2026" badge="Available" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Guest" value="Kwame Adjei" />
        <FieldBox label="Nightly rate" value="GH₵620" />
      </div>
      <PanelNote>A room with an overlapping booking for those dates can&apos;t be reserved twice.</PanelNote>
    </BrowserFrame>
  );
}

function FolioPreview() {
  return (
    <BrowserFrame path="/app/hotel/folios">
      <PanelHeader title="Folio · Room 214" badge="Balance due" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Balance" value="GH₵1,860" highlight />
        <FieldBox label="Check-out" value="Blocked until settled" />
      </div>
      <PanelNote>Check-out is blocked while a balance remains, unless the property explicitly allows it.</PanelNote>
    </BrowserFrame>
  );
}

export function HotelModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day front-desk operations actually look like">
      <OverviewPreview />
      <div className="grid gap-4">
        <ReservationPreview />
        <FolioPreview />
      </div>
    </ShowcaseSection>
  );
}
