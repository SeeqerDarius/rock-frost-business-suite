import { BookOpen, GraduationCap, Plus, Settings2, Shapes, UserCog, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, listOrganizationStaffForAssignment, listSchoolCampuses, listSchoolClassTeacherAssignments, listSchoolStudents } from "@/modules/school/service";
import { assignClassTeacherAction, createClassAction, createSubjectAction, enrollStudentAction, removeClassTeacherAction, updateClassCapacityAction } from "../actions";

export default async function SchoolClassesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManageAcademics = hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE);
  const canManageEnrollment = hasPermission(tenant, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE);
  const [[years, classes, subjects], campuses, students, teacherAssignments, staff] = await Promise.all([
    getSchoolAcademicSetup(tenant.organizationId),
    listSchoolCampuses(tenant.organizationId),
    listSchoolStudents(tenant.organizationId),
    listSchoolClassTeacherAssignments(tenant.organizationId),
    listOrganizationStaffForAssignment(tenant.organizationId),
  ]);

  const campusOptions = campuses.map((campus) => ({ value: campus.id, label: campus.name }));
  const activeStudents = students.filter((student) => student.status === "ACTIVE");
  const staffOptions = staff.map((member) => ({ value: member.userId, label: `${member.user.name ?? member.user.email}${member.role ? ` · ${member.role.name}` : ""}` }));
  const teachersByClass = new Map<string, typeof teacherAssignments>();
  for (const assignment of teacherAssignments) {
    const list = teachersByClass.get(assignment.classId) ?? [];
    list.push(assignment);
    teachersByClass.set(assignment.classId, list);
  }

  const newClassDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />New class</Button>}
      title="New class"
      description="A class belongs to one campus. Capacity is enforced when students are enrolled."
      action={createClassAction}
      submitLabel="Create class"
    >
      <SelectField id="class-campus" name="campusId" label="Campus" required options={campusOptions} emptyHint="Create a campus first." />
      <FieldGrid>
        <TextField id="class-code" name="code" label="Class code" required maxLength={200} hint="Short identifier, e.g. JHS1A." />
        <TextField id="class-name" name="name" label="Class name" required maxLength={200} />
      </FieldGrid>
      <FieldGrid>
        <TextField id="class-grade" name="gradeLevel" label="Grade level" maxLength={200} hint="Optional." />
        <TextField id="class-capacity" name="capacity" label="Capacity" type="number" min="1" max="10000" hint="Optional. Enrollment is blocked once this is reached." />
      </FieldGrid>
    </EntityDialog>
  );

  const newSubjectDialog = (
    <EntityDialog
      trigger={<Button size="sm" variant="outline"><BookOpen />New subject</Button>}
      title="New subject"
      description="Subjects are shared across all campuses and are used by timetables and exams."
      action={createSubjectAction}
      submitLabel="Create subject"
    >
      <FieldGrid>
        <TextField id="subject-code" name="code" label="Subject code" required maxLength={200} hint="Short identifier, e.g. MATH." />
        <TextField id="subject-name" name="name" label="Subject name" required maxLength={200} />
      </FieldGrid>
      <div className="space-y-1.5">
        <Label htmlFor="subject-description">Description</Label>
        <Textarea id="subject-description" name="description" rows={3} maxLength={5000} />
        <p className="text-xs leading-relaxed text-muted-foreground">Optional.</p>
      </div>
    </EntityDialog>
  );

  const enrollDialog = (
    <EntityDialog
      trigger={<Button size="sm" variant="outline"><GraduationCap />Enroll student</Button>}
      title="Enroll a student"
      description="The student and the class must belong to the campus you select, and the class must have room."
      action={enrollStudentAction}
      submitLabel="Enroll student"
    >
      <SelectField id="enroll-campus" name="campusId" label="Campus" required options={campusOptions} emptyHint="Create a campus first." />
      <SelectField id="enroll-year" name="academicYearId" label="Academic year" required options={years.map((year) => ({ value: year.id, label: year.current ? `${year.name} (current)` : year.name }))} emptyHint="Create an academic year first." />
      <SelectField
        id="enroll-student"
        name="studentId"
        label="Student"
        required
        options={activeStudents.map((student) => ({ value: student.id, label: `${student.lastName}, ${student.firstName} (${student.admissionNumber})` }))}
        emptyHint="Only active students can be enrolled."
        hint="Only active students are listed."
      />
      <SelectField
        id="enroll-class"
        name="classId"
        label="Class"
        required
        options={classes.map((schoolClass) => ({ value: schoolClass.id, label: `${schoolClass.campus.name} · ${schoolClass.name}${schoolClass.capacity ? ` (${schoolClass.enrollments.length}/${schoolClass.capacity})` : ""}` }))}
        emptyHint="Create a class first."
      />
    </EntityDialog>
  );

  const canDoAnything = canManageAcademics || canManageEnrollment;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Classes & Enrollment"
        description="Classes, subjects, capacity-aware placement, and academic enrollment."
        actions={
          canDoAnything ? (
            <>
              {canManageAcademics ? newClassDialog : null}
              {canManageAcademics ? newSubjectDialog : null}
              {canManageEnrollment && classes.length > 0 && years.length > 0 ? enrollDialog : null}
            </>
          ) : undefined
        }
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="The class, subject, or enrollment is saved."
        stateMessage="The class is full, or the student, class, and academic year do not belong to the campus you selected."
      />
      {!canDoAnything ? <ReadOnlyNotice>Your role can review classes and subjects but cannot change them or enroll students.</ReadOnlyNotice> : null}
      <PrerequisiteNotice
        items={[
          { satisfied: campuses.length > 0, label: "Create a campus", href: "/app/school/campuses" },
          { satisfied: years.length > 0, label: "Create an academic year", href: "/app/school/academic-periods" },
        ]}
      />

      {classes.length === 0 ? (
        <EmptyState
          icon={Shapes}
          title="No classes yet"
          description="Create classes and subjects before enrolling students. Enrollment links a student to a class for one academic year."
          action={canManageAcademics && campuses.length > 0 ? newClassDialog : undefined}
        />
      ) : (
        <SectionCard title="Classes" description={`${classes.length} class${classes.length === 1 ? "" : "es"} across ${campuses.length} campus${campuses.length === 1 ? "" : "es"}.`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="hidden md:table-cell">Campus</TableHead>
                <TableHead className="hidden lg:table-cell">Grade level</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead className="hidden lg:table-cell">Teachers</TableHead>
                {canManageAcademics ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((schoolClass) => {
                const enrolled = schoolClass.enrollments.length;
                const isFull = schoolClass.capacity !== null && enrolled >= schoolClass.capacity;
                const assignedTeachers = teachersByClass.get(schoolClass.id) ?? [];
                return (
                  <TableRow key={schoolClass.id}>
                    <TableCell className="font-mono text-xs">{schoolClass.code}</TableCell>
                    <TableCell>
                      <span className="font-medium">{schoolClass.name}</span>
                      <span className="block text-xs text-muted-foreground md:hidden">{schoolClass.campus.name}</span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{schoolClass.campus.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{schoolClass.gradeLevel ?? "—"}</TableCell>
                    <TableCell>
                      <span className="tabular-nums">{enrolled}{schoolClass.capacity ? ` / ${schoolClass.capacity}` : ""}</span>
                      {isFull ? <Badge variant="destructive" className="ml-2">Full</Badge> : null}
                      {schoolClass.capacity === null ? <span className="ml-2 text-xs text-muted-foreground">No limit</span> : null}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {assignedTeachers.length > 0 ? assignedTeachers.map((assignment) => assignment.user.name ?? assignment.user.email).join(", ") : "Unassigned"}
                    </TableCell>
                    {canManageAcademics ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Dialog>
                            <DialogTrigger render={<Button size="icon" variant="ghost" aria-label={`Edit capacity for ${schoolClass.name}`} />}>
                              <Settings2 />
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-sm">
                              <DialogHeader>
                                <DialogTitle>Edit capacity: {schoolClass.name}</DialogTitle>
                                <DialogDescription>{enrolled} student{enrolled === 1 ? "" : "s"} currently enrolled. Capacity cannot be set below that.</DialogDescription>
                              </DialogHeader>
                              <form action={updateClassCapacityAction} className="space-y-4">
                                <input type="hidden" name="classId" value={schoolClass.id} />
                                <TextField id={`capacity-${schoolClass.id}`} name="capacity" label="Capacity" type="number" min="1" max="10000" defaultValue={schoolClass.capacity ?? undefined} hint="Leave blank for no limit." />
                                <Button type="submit" className="w-full">Save capacity</Button>
                              </form>
                            </DialogContent>
                          </Dialog>
                          <Dialog>
                            <DialogTrigger render={<Button size="icon" variant="ghost" aria-label={`Manage teachers for ${schoolClass.name}`} />}>
                              <UserCog />
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                              <DialogHeader>
                                <DialogTitle>Teachers: {schoolClass.name}</DialogTitle>
                                <DialogDescription>Assigning a teacher restricts them to recording attendance and exam results only for this class (and any others they&apos;re assigned to).</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-3">
                                {assignedTeachers.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No teacher assigned yet. Unassigned staff with School permissions can still act on any class.</p>
                                ) : (
                                  <ul className="space-y-2">
                                    {assignedTeachers.map((assignment) => (
                                      <li key={assignment.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                                        <span>{assignment.user.name ?? assignment.user.email}</span>
                                        <form action={removeClassTeacherAction}>
                                          <input type="hidden" name="classId" value={schoolClass.id} />
                                          <input type="hidden" name="userId" value={assignment.userId} />
                                          <Button type="submit" size="icon-sm" variant="ghost" aria-label={`Remove ${assignment.user.name ?? assignment.user.email}`}><X /></Button>
                                        </form>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <form action={assignClassTeacherAction} className="flex items-end gap-2">
                                  <input type="hidden" name="classId" value={schoolClass.id} />
                                  <SelectField id={`assign-teacher-${schoolClass.id}`} name="userId" label="Assign teacher" options={staffOptions} emptyHint="No active staff to assign." className="flex-1" />
                                  <Button type="submit">Assign</Button>
                                </form>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      <SectionCard title="Subjects" description={`${subjects.length} active subject${subjects.length === 1 ? "" : "s"} available to timetables and exams.`}>
        {subjects.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No subjects yet. Timetables and exams both require a subject.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map((subject) => (
                <TableRow key={subject.id}>
                  <TableCell className="font-mono text-xs">{subject.code}</TableCell>
                  <TableCell className="font-medium">{subject.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{subject.description ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
