import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/projects">
      <p className="text-xs font-medium text-muted-foreground">Projects Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Active projects" value="11" sub="Currently in progress" />
        <StatTile label="Open tasks" value="64" sub="Not yet done" />
        <StatTile label="Overdue tasks" value="7" sub="Past their due date" />
        <StatTile label="Total projects" value="38" sub="Tracked in total" />
      </div>
    </BrowserFrame>
  );
}

function CompletionPreview() {
  return (
    <BrowserFrame path="/app/projects/projects">
      <PanelHeader title="Warehouse expansion" badge="2 milestones open" />
      <div className="mt-3 text-[11px]">
        <FieldBox label="Complete project" value="Blocked until every milestone is done" highlight />
      </div>
      <PanelNote>A project can&apos;t be marked complete while any milestone under it is still open.</PanelNote>
    </BrowserFrame>
  );
}

function TaskPreview() {
  return (
    <BrowserFrame path="/app/projects/tasks">
      <PanelHeader title="Fit out ground floor" badge="In review" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Assignee" value="Nana Yeboah" />
        <FieldBox label="Next step" value="Move to Done" />
      </div>
      <PanelNote>Tasks move forward one stage at a time, no skipping ahead and no jumping backward from the board.</PanelNote>
    </BrowserFrame>
  );
}

export function ProjectsModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day project delivery actually looks like">
      <OverviewPreview />
      <div className="grid gap-4">
        <CompletionPreview />
        <TaskPreview />
      </div>
    </ShowcaseSection>
  );
}
