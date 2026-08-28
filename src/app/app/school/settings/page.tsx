import Link from "next/link";
import { School } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { CheckboxField, FieldGrid, TextField } from "@/components/school/form-fields";
import { GradingScaleField } from "@/components/school/grading-scale-field";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSchoolSettings } from "@/modules/school/service";
import { upsertSchoolSettingsAction } from "../actions";

export default async function SchoolSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_SETTINGS_MANAGE);
  const campuses = await listSchoolSettings(tenant.organizationId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="School Settings" description="Attendance correction windows, receipt numbering, grading scales, and ranking policy. Settings are stored per campus." />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="The campus configuration is now active for new School workflows."
        stateMessage="This campus could not be updated. Refresh the page and try again."
      />
      {!canManage ? <ReadOnlyNotice>Your role can review School settings but cannot change them.</ReadOnlyNotice> : null}

      {campuses.length === 0 ? (
        <EmptyState
          icon={School}
          title="Create a campus first"
          description="School policies are stored per campus so multi-campus organizations can operate independently."
          action={<Button nativeButton={false} render={<Link href="/app/school/campuses" />}>Go to campuses</Button>}
        />
      ) : (
        campuses.map((campus) => {
          const settings = campus.settings;
          return (
            <form key={campus.id} action={upsertSchoolSettingsAction}>
              <input type="hidden" name="campusId" value={campus.id} />
              <Card className="shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle>{campus.name}</CardTitle>
                  <CardDescription>{campus.code} · These settings apply only to this campus.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                  <section className="space-y-4">
                    <div>
                      <h2 className="text-sm font-semibold">Attendance and numbering</h2>
                      <p className="text-xs text-muted-foreground">Controls how far back attendance can be corrected and how fee receipts are numbered.</p>
                    </div>
                    <FieldGrid>
                      <TextField
                        id={`${campus.id}-attendance-close-days`}
                        name="attendanceCloseDays"
                        label="Attendance correction window (days)"
                        type="number"
                        min="0"
                        max="365"
                        defaultValue={settings?.attendanceCloseDays ?? 7}
                        disabled={!canManage}
                        required
                        hint="Attendance older than this cannot be recorded or corrected."
                      />
                      <TextField
                        id={`${campus.id}-receipt-prefix`}
                        name="receiptPrefix"
                        label="Receipt prefix"
                        defaultValue={settings?.receiptPrefix ?? "SCH"}
                        disabled={!canManage}
                        required
                        maxLength={200}
                        className="[&_input]:uppercase"
                        hint="Fee receipts are numbered PREFIX-00001."
                      />
                    </FieldGrid>
                  </section>

                  <section className="space-y-4">
                    <div>
                      <h2 className="text-sm font-semibold">Grading and reporting</h2>
                      <p className="text-xs text-muted-foreground">How exam marks are presented on report cards.</p>
                    </div>
                    <GradingScaleField value={settings?.gradingScale} disabled={!canManage} />
                    <CheckboxField
                      id={`${campus.id}-allow-ranking`}
                      name="allowRanking"
                      label="Allow class rankings"
                      hint="Publishes each student's position within their class alongside results."
                      defaultChecked={settings?.allowRanking}
                      disabled={!canManage}
                    />
                  </section>
                </CardContent>
                {canManage ? (
                  <CardFooter className="justify-end">
                    <Button type="submit">Save {campus.name}</Button>
                  </CardFooter>
                ) : null}
              </Card>
            </form>
          );
        })
      )}
    </div>
  );
}
