import { BrowserFrame, FieldBox, PanelHeader, PanelNote, ShowcaseSection, StatTile } from "@/components/marketing/module-showcases/kit";

function OverviewPreview() {
  return (
    <BrowserFrame path="/app/hospital">
      <p className="text-xs font-medium text-muted-foreground">Hospital Overview</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Active patients" value="1,840" sub="Currently on record" />
        <StatTile label="Today's appointments" value="52" sub="Scheduled or checked in" />
        <StatTile label="Beds occupied" value="61 / 80" sub="Of total active beds" />
        <StatTile label="Pending lab items" value="14" sub="Not yet verified" />
      </div>
    </BrowserFrame>
  );
}

function AdmissionsPreview() {
  return (
    <BrowserFrame path="/app/hospital/admissions">
      <PanelHeader title="Ward B · Bed 14" badge="Claimed" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Patient" value="MRN-04821" />
        <FieldBox label="Admitting provider" value="Dr. Boateng" />
      </div>
      <PanelNote>A bed can only be claimed by one admission at a time, two staff can&apos;t admit into it simultaneously.</PanelNote>
    </BrowserFrame>
  );
}

function LabPreview() {
  return (
    <BrowserFrame path="/app/hospital/laboratory">
      <PanelHeader title="Full Blood Count · Result verified" badge="Locked" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <FieldBox label="Result" value="Verified" highlight />
        <FieldBox label="Correction" value="Requires a reason" />
      </div>
      <PanelNote>A verified result can&apos;t be edited, only corrected, and every correction keeps the original on record.</PanelNote>
    </BrowserFrame>
  );
}

export function HospitalModuleShowcase() {
  return (
    <ShowcaseSection title="What day-to-day clinical operations actually look like">
      <OverviewPreview />
      <div className="grid gap-4">
        <AdmissionsPreview />
        <LabPreview />
      </div>
    </ShowcaseSection>
  );
}
