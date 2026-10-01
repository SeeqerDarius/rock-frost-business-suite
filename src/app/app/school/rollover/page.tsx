import { ArrowRight, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { SectionCard } from "@/components/school/section-card";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { listSchoolAcademicYears, getSchoolEnrollmentRolloverPreview, listSchoolRolloverTargetClasses, SchoolStateError } from "@/modules/school/service";
import { rollOverEnrollmentsAction } from "../actions";

export default async function SchoolEnrollmentRolloverPage({ searchParams }: { searchParams: Promise<{ sourceYear?: string; targetYear?: string; saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE);
  const years = await listSchoolAcademicYears(tenant.organizationId);
  const openYears = years.filter((year) => !year.closedAt);
  const sourceYearId = query.sourceYear ?? "";
  const targetYearId = query.targetYear ?? "";
  let preview: Awaited<ReturnType<typeof getSchoolEnrollmentRolloverPreview>> | undefined;
  let targetClasses: Awaited<ReturnType<typeof listSchoolRolloverTargetClasses>> = [];
  if (sourceYearId && years.some((year) => year.id === sourceYearId)) {
    try {
      preview = await getSchoolEnrollmentRolloverPreview(tenant.organizationId, sourceYearId);
      if (targetYearId && openYears.some((year) => year.id === targetYearId) && targetYearId !== sourceYearId) targetClasses = await listSchoolRolloverTargetClasses(tenant.organizationId, targetYearId);
    } catch (error) {
      if (!(error instanceof SchoolStateError)) throw error;
      query.error = `state-${error.code}`;
    }
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <PageHeader title="Academic year rollover" description="Review active learners, map each class at the same campus, then move the cohort in one transaction." />
      <FormFeedback saved={query.saved} error={query.error} savedMessage="Learner enrollments were moved to the new year. The previous year records are preserved as completed history." stateMessage="Review the selected years, mappings, campus, and class capacity, then refresh the preview. Nothing was partially moved." />
      {!canManage ? <ReadOnlyNotice>Your role can review academic years but cannot roll learners forward.</ReadOnlyNotice> : null}

      <SectionCard title="Choose years" description="The source class groups come from active student enrollments. A destination class must belong to the same campus.">
        <form method="get" action="/app/school/rollover" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="rollover-source">From academic year
            <select id="rollover-source" name="sourceYear" required defaultValue={sourceYearId} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Choose a source year</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.closedAt ? " (archived)" : ""}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="rollover-target">Into academic year
            <select id="rollover-target" name="targetYear" required defaultValue={targetYearId} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Choose a destination year</option>{openYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </label>
          <Button type="submit" variant="outline">Review learners</Button>
        </form>
      </SectionCard>

      {preview ? <SectionCard title={`${preview.year.name}: ${preview.totalLearners} active learners`} description="Map each source class to one active class at the same campus. Learners already enrolled in the destination year are skipped without changing their existing placement.">
        {preview.totalLearners === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">There are no active learners enrolled in this source year.</p> : targetYearId === sourceYearId ? <p className="text-sm text-muted-foreground">Choose a different destination year to review the class mappings.</p> : targetClasses.length === 0 ? <p className="text-sm text-muted-foreground">Choose a destination year and create its classes before moving learners.</p> : (
          <form action={rollOverEnrollmentsAction} className="space-y-4">
            <input type="hidden" name="sourceYearId" value={sourceYearId} /><input type="hidden" name="targetYearId" value={targetYearId} />
            <div className="overflow-x-auto rounded-md border"><table className="w-full text-left text-sm">
              <thead><tr className="border-b bg-muted/40"><th className="px-3 py-2 font-medium">Source class</th><th className="px-3 py-2 font-medium">Active learners</th><th className="px-3 py-2 font-medium">Destination class</th></tr></thead>
              <tbody>{preview.classes.map((sourceClass) => {
                const options = targetClasses.filter((destination) => destination.campusId === sourceClass.campusId);
                return <tr key={sourceClass.id} className="border-b last:border-0">
                  <td className="px-3 py-3"><input type="hidden" name={`classCount_${sourceClass.id}`} value={sourceClass.learners} /><span className="font-medium">{sourceClass.code} · {sourceClass.name}</span><span className="block text-xs text-muted-foreground">{sourceClass.campusName}</span></td>
                  <td className="px-3 py-3 tabular-nums">{sourceClass.learners}</td>
                  <td className="min-w-64 px-3 py-3"><label className="sr-only" htmlFor={`rollover-map-${sourceClass.id}`}>Destination for {sourceClass.name}</label>
                    <select id={`rollover-map-${sourceClass.id}`} name={`classMap_${sourceClass.id}`} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue="">
                      <option value="">Choose a class at {sourceClass.campusName}</option>{options.map((destination) => <option key={destination.id} value={destination.id}>{destination.code} · {destination.name} ({destination.currentEnrollment}{destination.capacity === null ? " enrolled" : ` of ${destination.capacity}`})</option>)}
                    </select>{options.length === 0 ? <span className="mt-1 block text-xs text-destructive">No active destination classes exist at this campus.</span> : null}
                  </td>
                </tr>;
              })}</tbody>
            </table></div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="flex items-center gap-2 font-medium"><GraduationCap className="size-4" />Review before moving {preview.totalLearners} learners</p>
              <p className="mt-1 text-muted-foreground">This creates destination enrollments, completes their active source-year enrollments, and writes one audit record. If capacity or data checks fail, the whole batch rolls back. Existing destination-year placements stay as they are.</p>
            </div>
            <Button type="submit" disabled={!canManage || preview.classes.some((sourceClass) => !targetClasses.some((destination) => destination.campusId === sourceClass.campusId))}>Move active learners <ArrowRight /></Button>
          </form>
        )}
      </SectionCard> : null}
    </div>
  );
}
