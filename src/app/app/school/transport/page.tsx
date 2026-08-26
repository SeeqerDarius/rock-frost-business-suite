import { Bus, Plus, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { formatMoney } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSchoolCampuses, listSchoolStudents, listSchoolTransport } from "@/modules/school/service";
import { assignTransportAction, createTransportRouteAction } from "../actions";

/** `stops` is a Json column written as a string array by createTransportRouteAction. */
function readStops(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((stop): stop is string => typeof stop === "string") : [];
}

export default async function SchoolTransportPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_TRANSPORT_MANAGE);
  const [campuses, students, routes] = await Promise.all([
    listSchoolCampuses(tenant.organizationId),
    listSchoolStudents(tenant.organizationId),
    listSchoolTransport(tenant.organizationId),
  ]);

  const activeStudents = students.filter((student) => student.status === "ACTIVE");

  const newRouteDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />New route</Button>}
      title="New transport route"
      description="A route belongs to one campus. Students are assigned to it afterwards."
      action={createTransportRouteAction}
      submitLabel="Create route"
    >
      <SelectField id="route-campus" name="campusId" label="Campus" required options={campuses.map((campus) => ({ value: campus.id, label: campus.name }))} emptyHint="Create a campus first." />
      <FieldGrid>
        <TextField id="route-code" name="code" label="Route code" required maxLength={200} hint="Short identifier, e.g. R1." />
        <TextField id="route-name" name="name" label="Route name" required maxLength={200} />
      </FieldGrid>
      <FieldGrid>
        <TextField id="route-vehicle" name="vehicle" label="Vehicle" maxLength={200} hint="Optional. Registration or bus number." />
        <TextField id="route-driver" name="driverName" label="Driver" maxLength={200} hint="Optional." />
      </FieldGrid>
      <TextField id="route-stops" name="stops" label="Stops" placeholder="Adenta, Madina, Legon" maxLength={200} hint="Optional. Separate each stop with a comma, in pick-up order." />
      <TextField id="route-fee" name="fee" label="Termly fee" type="number" step="0.01" min="0" defaultValue="0" hint="Recorded on the route. Transport fees are invoiced through Fees & Payments." />
    </EntityDialog>
  );

  const assignDialog = (
    <EntityDialog
      trigger={<Button size="sm" variant="outline"><UserPlus />Assign student</Button>}
      title="Assign a student to a route"
      description="Assigning the same student again updates their boarding stop."
      action={assignTransportAction}
      submitLabel="Assign student"
    >
      <SelectField id="assign-route" name="routeId" label="Route" required options={routes.filter((route) => route.active).map((route) => ({ value: route.id, label: `${route.campus.name} · ${route.name}` }))} emptyHint="Create a route first." />
      <SelectField
        id="assign-student"
        name="studentId"
        label="Student"
        required
        options={activeStudents.map((student) => ({ value: student.id, label: `${student.lastName}, ${student.firstName} (${student.admissionNumber})` }))}
        emptyHint="Only active students can be assigned."
        hint="Only active students are listed."
      />
      <TextField id="assign-stop" name="stopName" label="Boarding stop" maxLength={200} hint="Optional. Where this student joins the route." />
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Transport"
        description="Routes, vehicles, drivers, stops, and student assignments."
        actions={canManage ? <>{campuses.length > 0 ? newRouteDialog : null}{routes.length > 0 && activeStudents.length > 0 ? assignDialog : null}</> : undefined}
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="The transport record is up to date."
        stateMessage="The route or student could not be used: the route must be active and the student must be active."
      />
      {!canManage ? <ReadOnlyNotice>Your role can review transport routes but cannot change them or assign students.</ReadOnlyNotice> : null}
      <PrerequisiteNotice items={[{ satisfied: campuses.length > 0, label: "Create a campus", href: "/app/school/campuses" }]} />

      {routes.length === 0 ? (
        <EmptyState
          icon={Bus}
          title="No transport routes yet"
          description="Create a route with its stops and vehicle, then assign the students who travel on it."
          action={canManage && campuses.length > 0 ? newRouteDialog : undefined}
        />
      ) : (
        routes.map((route) => {
          const stops = readStops(route.stops);
          const assignments = route.assignments.filter((assignment) => assignment.active);
          return (
            <SectionCard
              key={route.id}
              title={`${route.name} · ${route.code}`}
              description={`${route.campus.name} · ${route.vehicle ?? "No vehicle recorded"} · Driver: ${route.driverName ?? "Not recorded"} · ${formatMoney(route.fee)} per term`}
              actions={
                <>
                  <Badge variant="outline">{assignments.length} student{assignments.length === 1 ? "" : "s"}</Badge>
                  {route.active ? null : <Badge variant="outline">Inactive</Badge>}
                </>
              }
            >
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground">Stops</h3>
                  {stops.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">No stops recorded for this route.</p>
                  ) : (
                    <ol className="mt-2 flex flex-wrap items-center gap-2">
                      {stops.map((stop, index) => (
                        <li key={`${stop}-${index}`}>
                          <Badge variant="secondary">{index + 1}. {stop}</Badge>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-medium text-muted-foreground">Assigned students</h3>
                  {assignments.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">No students assigned to this route yet.</p>
                  ) : (
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Admission no.</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Boarding stop</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignments.map((assignment) => (
                          <TableRow key={assignment.id}>
                            <TableCell className="font-mono text-xs">{assignment.student.admissionNumber}</TableCell>
                            <TableCell className="font-medium">{assignment.student.firstName} {assignment.student.lastName}</TableCell>
                            <TableCell className="text-muted-foreground">{assignment.stopName ?? "Not set"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
