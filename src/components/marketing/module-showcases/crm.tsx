import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/crm">
      <p className="text-xs font-medium text-muted-foreground">CRM Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Contacts" value="640" sub="People and companies" />
        <StatTile label="Open leads" value="47" sub="Not yet converted" />
        <StatTile label="Open deals" value="23" sub="In the pipeline" />
        <StatTile label="Activity this month" value="188" sub="Calls, emails, notes" />
      </div>
    </BrowserFrame>
  );
}

function LeadConversionPreview() {
  return (
    <BrowserFrame path="/app/crm/leads">
      <PanelHeader title="Yaw Mensah · Convert to deal" badge="One-way" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Deal title" value="Yaw Mensah (Osei Traders)" />
        <FieldBox label="Estimated value" value="GH₵15,000" />
      </div>
      <PanelNote>Once converted, a lead is locked, it can never be converted again, keeping a clean audit trail.</PanelNote>
    </BrowserFrame>
  );
}

function DealStagePreview() {
  return (
    <BrowserFrame path="/app/crm/deals">
      <PanelHeader title="Osei Traders · Supply contract" badge="Proposal" />
      <div className="mt-3 text-[11px]">
        <FieldBox label="Next action" value="Move to Negotiation" highlight />
      </div>
      <PanelNote>Stages move forward one step at a time, no skipping ahead and no reopening a deal marked won or lost.</PanelNote>
    </BrowserFrame>
  );
}

export function CrmModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day pipeline management actually looks like">
      <OverviewPreview />
      <div className="grid gap-4">
        <LeadConversionPreview />
        <DealStagePreview />
      </div>
    </ShowcaseSection>
  );
}
