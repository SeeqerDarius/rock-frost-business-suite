import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/pos">
      <p className="text-xs font-medium text-muted-foreground">POS Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Open sessions" value="3" sub="Registers open for checkout" />
        <StatTile label="Today's sales" value="142 · GH₵18,600" sub="Recorded so far today" />
        <StatTile label="All-time sales" value="24,900" sub="Across all registers" />
        <StatTile label="Refunded sales" value="6" sub="This month" />
      </div>
    </BrowserFrame>
  );
}

function SellPreview() {
  return (
    <BrowserFrame path="/app/pos/sell">
      <PanelHeader title="Register 2 · New sale" badge="Stock checked" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Item" value="Bottled Water 500ml × 3" />
        <FieldBox label="Payment" value="Mobile Money" />
      </div>
      <PanelNote>Stock is checked and deducted in the same step, if any line is out of stock the whole sale is stopped.</PanelNote>
    </BrowserFrame>
  );
}

function RegisterPreview() {
  return (
    <BrowserFrame path="/app/pos/registers">
      <PanelHeader title="Register 2" badge="Session open" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Warehouse" value="Osu Store" />
        <FieldBox label="Opening float" value="GH₵200" />
      </div>
      <PanelNote>A register can&apos;t have two sessions open at once, closing one is required before it opens again.</PanelNote>
    </BrowserFrame>
  );
}

export function PosModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day checkout actually looks like">
      <OverviewPreview />
      <div className="grid gap-4">
        <SellPreview />
        <RegisterPreview />
      </div>
    </ShowcaseSection>
  );
}
