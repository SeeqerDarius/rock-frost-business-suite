import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/procurement">
      <p className="text-xs font-medium text-muted-foreground">Procurement Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Pending requests" value="9" sub="Awaiting approval" />
        <StatTile label="Open orders" value="14" sub="Not yet fully received" />
        <StatTile label="Open order value" value="GH₵52,900" sub="Committed value" />
        <StatTile label="Received orders" value="61" sub="To date" />
      </div>
    </BrowserFrame>
  );
}

function OrderPreview() {
  return (
    <BrowserFrame path="/app/procurement/orders">
      <PanelHeader title="PO-00214 · Kumasi Warehouse" badge="Partially received" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Received" value="60 / 100 cartons" />
        <FieldBox label="Stock updated" value="Automatically" highlight />
      </div>
      <PanelNote>Receiving a line posts an inventory stock movement and updates the order&apos;s status on its own.</PanelNote>
    </BrowserFrame>
  );
}

function RequestPreview() {
  return (
    <BrowserFrame path="/app/procurement/requests">
      <PanelHeader title="PR-00089 · Office chairs" badge="Approved" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Estimated cost" value="GH₵4,800" />
        <FieldBox label="Status" value="Ready to order" highlight />
      </div>
      <PanelNote>Only approved requests can be linked into a purchase order, and each one converts just once.</PanelNote>
    </BrowserFrame>
  );
}

export function ProcurementModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day purchasing actually looks like">
      <OverviewPreview />
      <div className="grid gap-4">
        <OrderPreview />
        <RequestPreview />
      </div>
    </ShowcaseSection>
  );
}
