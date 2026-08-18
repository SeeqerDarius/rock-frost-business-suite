import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/inventory">
      <p className="text-xs font-medium text-muted-foreground">Inventory & Procurement</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Active items" value="1,204" sub="SKUs tracked" />
        <StatTile label="Warehouses" value="5" sub="Stock locations in use" />
        <StatTile label="Low stock items" value="18" sub="At or below reorder point" />
        <StatTile label="Movements this month" value="342" sub="Receipts, issues, transfers" />
      </div>
    </BrowserFrame>
  );
}

function LowStockPreview() {
  return (
    <BrowserFrame path="/app/inventory/items">
      <PanelHeader title="SKU-00842 · A4 Printing Paper" badge="Low stock" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="On hand" value="14" />
        <FieldBox label="Reorder point" value="25" highlight />
      </div>
      <PanelNote>On-hand quantity is totalled live across every warehouse and compared against the reorder point automatically.</PanelNote>
    </BrowserFrame>
  );
}

function MovementPreview() {
  return (
    <BrowserFrame path="/app/inventory/movements">
      <PanelHeader title="Transfer · Accra Warehouse → Kumasi Warehouse" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Item" value="A4 Printing Paper" />
        <FieldBox label="Quantity" value="40 cartons" />
      </div>
      <PanelNote>Transfers exceeding available stock, or sent to the same warehouse, are rejected automatically.</PanelNote>
    </BrowserFrame>
  );
}

export function InventoryModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day stock control actually looks like">
      <OverviewPreview />
      <div className="grid gap-4">
        <LowStockPreview />
        <MovementPreview />
      </div>
    </ShowcaseSection>
  );
}
