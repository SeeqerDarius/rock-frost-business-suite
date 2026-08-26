import { Plus, School, Users, Shapes } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { FieldGrid, TextField } from "@/components/school/form-fields";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSchoolCampuses } from "@/modules/school/service";
import { createCampusAction } from "../actions";

export default async function SchoolCampusesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_CAMPUSES_MANAGE);
  const campuses = await listSchoolCampuses(tenant.organizationId);

  const newCampusDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />New campus</Button>}
      title="New campus"
      description="A campus is a physical school site. Students, classes, fees, and transport all belong to one."
      action={createCampusAction}
      submitLabel="Create campus"
    >
      <FieldGrid>
        <TextField id="campus-code" name="code" label="Campus code" required maxLength={200} hint="Short identifier, e.g. MAIN." />
        <TextField id="campus-name" name="name" label="Campus name" required maxLength={200} />
      </FieldGrid>
      <TextField id="campus-address" name="address" label="Address" hint="Optional." />
      <FieldGrid>
        <TextField id="campus-phone" name="phone" label="Phone" type="tel" hint="Optional." />
        <TextField id="campus-email" name="email" label="Email" type="email" hint="Optional." />
      </FieldGrid>
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Campuses"
        description="School sites and their contact details. Every student, class, and fee record belongs to a campus."
        actions={canManage ? newCampusDialog : undefined}
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="The campus is now available for students, classes, fees, and transport."
        stateMessage="This campus could not be created. Check that the campus code is not already in use."
      />
      {!canManage ? <ReadOnlyNotice>Your role can review campuses but cannot create or change them.</ReadOnlyNotice> : null}

      {campuses.length === 0 ? (
        <EmptyState
          icon={School}
          title="No campuses yet"
          description="A campus is the first record a school needs: students, classes, and fees cannot be created without one."
          action={canManage ? newCampusDialog : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campuses.map((campus) => (
            <Card key={campus.id}>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-1">
                  <h2 className="font-medium">{campus.name}</h2>
                  <p className="font-mono text-xs text-muted-foreground">{campus.code}</p>
                </div>

                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5" />Students</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums">{campus._count.students}</dd>
                  </div>
                  <div className="rounded-lg border p-3">
                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Shapes className="size-3.5" />Classes</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums">{campus._count.classes}</dd>
                  </div>
                </dl>

                <dl className="space-y-1 text-sm">
                  {campus.address ? <div className="flex gap-2"><dt className="text-muted-foreground">Address</dt><dd>{campus.address}</dd></div> : null}
                  {campus.phone ? <div className="flex gap-2"><dt className="text-muted-foreground">Phone</dt><dd>{campus.phone}</dd></div> : null}
                  {campus.email ? <div className="flex gap-2"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{campus.email}</dd></div> : null}
                  {!campus.address && !campus.phone && !campus.email ? <p className="text-sm text-muted-foreground">No contact details recorded.</p> : null}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
