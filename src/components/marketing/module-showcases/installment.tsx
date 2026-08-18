import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/installment">
      <p className="text-xs font-medium text-muted-foreground">Installment Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Customers" value="312" sub="With an installment profile" />
        <StatTile label="Active accounts" value="204" sub="Active or overdue" />
        <StatTile label="Products" value="26" sub="Available for sale" />
        <StatTile label="Outstanding balance" value="GH₵118,400" sub="Owed across accounts" />
      </div>
    </BrowserFrame>
  );
}

function NewAccountPreview() {
  return (
    <BrowserFrame path="/app/installment/accounts">
      <PanelHeader title="New account · Efua Ansah" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Product" value="19&quot; TV, GH₵2,400" />
        <FieldBox label="Initial deposit" value="GH₵480" />
      </div>
      <PanelNote>Minimum deposit and the administration fee are applied automatically from the product price.</PanelNote>
    </BrowserFrame>
  );
}

function ReactivatePreview() {
  return (
    <BrowserFrame path="/app/installment/accounts">
      <PanelHeader title="Reactivate account" badge="Password required" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Status" value="Dormant → Active" highlight />
        <FieldBox label="Service fee" value="GH₵96 deducted" />
      </div>
      <PanelNote>The service fee and new balance are calculated automatically; every past payment stays on record.</PanelNote>
    </BrowserFrame>
  );
}

export function InstallmentModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day installment collections actually look like">
      <OverviewPreview />
      <div className="grid gap-4">
        <NewAccountPreview />
        <ReactivatePreview />
      </div>
    </ShowcaseSection>
  );
}
