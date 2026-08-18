import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/school">
      <p className="text-xs font-medium text-muted-foreground">School Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Active students" value="482" sub="Currently enrolled" />
        <StatTile label="Active classes" value="16" sub="Open for enrollment" />
        <StatTile label="Outstanding fees" value="GH₵4,250" sub="Open balances" />
        <StatTile label="Overdue loans" value="2" sub="Library, past due" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border p-3 text-[11px]">
        <div><p className="text-muted-foreground">Attendance rate</p><p className="mt-0.5 text-sm font-semibold">97%</p></div>
        <div><p className="text-muted-foreground">Collected this term</p><p className="mt-0.5 text-sm font-semibold">GH₵58,900</p></div>
        <div><p className="text-muted-foreground">Current term</p><p className="mt-0.5 text-sm font-semibold">Term 2</p></div>
      </div>
    </BrowserFrame>
  );
}

function AdmissionPreview() {
  return (
    <BrowserFrame path="/app/school/students">
      <PanelHeader title="Admit student" badge="Guardian included" />
      <div className="mt-3 space-y-2 text-[11px]">
        <div className="grid grid-cols-2 gap-2">
          <FieldBox label="First name" value="Ama" />
          <FieldBox label="Last name" value="Serwaa" />
        </div>
        <FieldBox label="Campus" value="Akuampem" />
        <div className="mt-3 rounded-md border border-dashed p-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Guardian (optional)</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <FieldBox label="Guardian name" value="Kwame Serwaa" />
            <FieldBox label="Relationship" value="Father" />
          </div>
        </div>
      </div>
      <PanelNote>One form creates the student and links their guardian, no separate record first.</PanelNote>
    </BrowserFrame>
  );
}

function ExamPreview() {
  return (
    <BrowserFrame path="/app/school/exams">
      <PanelHeader title="Term 2 Mathematics · Enter result" badge="Class auto-selected" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Student" value="Kojo Boateng" />
        <FieldBox label="Class" value="Class 3" highlight />
      </div>
      <div className="mt-2 text-[11px]"><FieldBox label="Marks" value="88 / 100 · Grade A" /></div>
      <PanelNote>Picking the student fills in their class automatically. Results stay hidden from families until published.</PanelNote>
    </BrowserFrame>
  );
}

export function SchoolModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day admin actually looks like">
      <OverviewPreview />
      <div className="grid gap-4">
        <AdmissionPreview />
        <ExamPreview />
      </div>
    </ShowcaseSection>
  );
}
