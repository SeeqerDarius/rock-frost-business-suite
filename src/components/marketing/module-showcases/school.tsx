import { Badge } from "@/components/ui/badge";

/**
 * Illustrative product previews, not live screenshots. These are hand-built
 * with the real UI kit (Card/Badge tokens, same border and muted-foreground
 * colors as the authenticated app) so they read as accurate, without ever
 * rendering a real organization's student, guardian, or fee data on a public
 * page. Sample data only, same disclosure convention as CustomerShowcase's
 * isDemo entries.
 */

function BrowserFrame({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
        </span>
        <span className="ml-2 truncate rounded-full bg-background px-3 py-0.5 text-[11px] text-muted-foreground ring-1 ring-foreground/10">
          app.rockfrostgroup.com{path}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

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
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Admit student</p>
        <Badge variant="outline" className="text-[10px]">Guardian included</Badge>
      </div>
      <div className="mt-3 space-y-2 text-[11px]">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border px-2.5 py-2"><p className="text-muted-foreground">First name</p><p className="font-medium">Ama</p></div>
          <div className="rounded-md border px-2.5 py-2"><p className="text-muted-foreground">Last name</p><p className="font-medium">Serwaa</p></div>
        </div>
        <div className="rounded-md border px-2.5 py-2"><p className="text-muted-foreground">Campus</p><p className="font-medium">Akuampem</p></div>
        <div className="mt-3 rounded-md border border-dashed p-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Guardian (optional)</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-md border bg-background px-2.5 py-2"><p className="text-muted-foreground">Guardian name</p><p className="font-medium">Kwame Serwaa</p></div>
            <div className="rounded-md border bg-background px-2.5 py-2"><p className="text-muted-foreground">Relationship</p><p className="font-medium">Father</p></div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">One form creates the student and links their guardian, no separate record first.</p>
    </BrowserFrame>
  );
}

function ExamPreview() {
  return (
    <BrowserFrame path="/app/school/exams">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Term 2 Mathematics · Enter result</p>
        <Badge variant="outline" className="text-[10px]">Class auto-selected</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md border px-2.5 py-2"><p className="text-muted-foreground">Student</p><p className="font-medium">Kojo Boateng</p></div>
        <div className="rounded-md border bg-primary/5 px-2.5 py-2 ring-1 ring-primary/20"><p className="text-muted-foreground">Class</p><p className="font-medium">Class 3</p></div>
      </div>
      <div className="mt-2 rounded-md border px-2.5 py-2 text-[11px]"><p className="text-muted-foreground">Marks</p><p className="font-medium">88 / 100 · Grade A</p></div>
      <p className="mt-3 text-[11px] text-muted-foreground">Picking the student fills in their class automatically. Results stay hidden from families until published.</p>
    </BrowserFrame>
  );
}

export function SchoolModuleShowcase() {
  return (
    <section aria-labelledby="school-showcase-title">
      <h2 id="school-showcase-title" className="text-2xl font-semibold tracking-tight">
        What day-to-day admin actually looks like
      </h2>
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <OverviewPreview />
        <div className="grid gap-4">
          <AdmissionPreview />
          <ExamPreview />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Illustrative previews built with sample data for demonstration, not a live customer record.
      </p>
    </section>
  );
}
