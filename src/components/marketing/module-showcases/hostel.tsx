import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/hostel">
      <p className="text-xs font-medium text-muted-foreground">Hostel Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Occupied beds" value="212 / 240" sub="Across 4 buildings" />
        <StatTile label="Active allocations" value="212" sub="Students housed" />
        <StatTile label="Wardens assigned" value="4" sub="One per building" />
        <StatTile label="Outstanding fees" value="GH₵6,400" sub="Open invoice balances" />
      </div>
    </BrowserFrame>
  );
}

function AllocationPreview() {
  return (
    <BrowserFrame path="/app/hostel/allocations">
      <PanelHeader title="Allocate bed · Amewuga House, Room 12" badge="Bed available" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Student" value="Efua Mensah" />
        <FieldBox label="Bed" value="Bed C" highlight />
      </div>
      <div className="mt-2 text-[11px]">
        <FieldBox label="Check-in date" value="2 Sep 2026" />
      </div>
      <PanelNote>A bed already holding an active allocation can&apos;t be assigned to a second student.</PanelNote>
    </BrowserFrame>
  );
}

function FeeInvoicePreview() {
  return (
    <BrowserFrame path="/app/hostel/fees">
      <PanelHeader title="Invoice HST-0142 · Efua Mensah" badge="Part paid" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Balance" value="GH₵350.00" highlight />
        <FieldBox label="Last payment" value="GH₵500.00 · Mobile Money" />
      </div>
      <PanelNote>Recording a payment updates the invoice status automatically once the balance is cleared.</PanelNote>
    </BrowserFrame>
  );
}

export function HostelModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day hostel administration actually looks like">
      <OverviewPreview />
      <div className="grid gap-4">
        <AllocationPreview />
        <FeeInvoicePreview />
      </div>
    </ShowcaseSection>
  );
}
