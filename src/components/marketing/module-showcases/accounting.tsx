import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/accounting">
      <p className="text-xs font-medium text-muted-foreground">Accounting Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Cash balance" value="GH₵86,300" sub="Across cash accounts" />
        <StatTile label="Outstanding invoices" value="12" sub="Awaiting payment" />
        <StatTile label="Pending expenses" value="7" sub="Awaiting approval" />
        <StatTile label="Net income" value="GH₵24,150" sub="This period" />
      </div>
    </BrowserFrame>
  );
}

function InvoicePreview() {
  return (
    <BrowserFrame path="/app/accounting/invoices">
      <PanelHeader title="INV-00118 · Volta Motors Ltd" badge="Sent" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Amount" value="GH₵6,200" />
        <FieldBox label="Journal entry" value="Posted" highlight />
      </div>
      <PanelNote>Sending an invoice posts a journal entry automatically; voiding a paid invoice is blocked and an unpaid one reverses the entry instead of deleting it.</PanelNote>
    </BrowserFrame>
  );
}

function ExpensePreview() {
  return (
    <BrowserFrame path="/app/accounting/expenses">
      <PanelHeader title="EXP-00073 · GreenLeaf Supplies" badge="Approved" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Category" value="Office supplies" />
        <FieldBox label="Amount" value="GH₵1,150" />
      </div>
      <PanelNote>Expenses move Pending → Approved → Paid, only an approved expense can be marked paid.</PanelNote>
    </BrowserFrame>
  );
}

export function AccountingModuleShowcase({ reverse }: { reverse?: boolean } = {}) {
  return (
    <ShowcaseSection title="What day-to-day bookkeeping actually looks like" reverse={reverse}>
      <OverviewPreview />
      <div className="grid gap-4">
        <InvoicePreview />
        <ExpensePreview />
      </div>
    </ShowcaseSection>
  );
}
