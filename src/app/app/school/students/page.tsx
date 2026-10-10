import Image from "next/image";
import Link from "next/link";
import { Eye, ImageIcon, Pencil, Plus, Users } from "lucide-react";
import type { SchoolStudentStatus } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhotoInputPreview } from "@/components/school/photo-input-preview";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { RecordSearch } from "@/components/school/record-search";
import { RecordPagination } from "@/components/school/record-pagination";
import { StatusBadge } from "@/components/school/status-badge";
import { formatDate, humanizeStatus } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSchoolCampuses, listSchoolGuardians, listSchoolStudentPage, listSchoolStudentPhotoIds, listSchoolGuardianPhotoIds } from "@/modules/school/service";
import { createGuardianAction, createStudentAction, manageStudentGuardiansAction, transitionStudentAction, updateStudentProfileAction, updateStudentPhotoAction, updateGuardianAction, updateGuardianPhotoAction } from "../actions";
import { StudentGuardianFields } from "./student-guardian-fields";

function PhotoThumb({ hasPhoto, src, alt }: { hasPhoto: boolean; src: string; alt: string }) {
  return hasPhoto ? (
    <Image src={src} alt={alt} width={40} height={40} unoptimized className="size-10 rounded-full border object-cover" />
  ) : (
    <div className="flex size-10 items-center justify-center rounded-full border bg-muted text-muted-foreground">
      <ImageIcon className="size-4" aria-hidden="true" />
    </div>
  );
}

const PATH = "/app/school/students";

/**
 * Mirrors STUDENT_TRANSITIONS in src/modules/school/service.ts so the UI
 * only offers moves the service will accept. The service remains the
 * authority and re-validates every transition.
 */
const ALLOWED_TRANSITIONS: Record<SchoolStudentStatus, SchoolStudentStatus[]> = {
  APPLICANT: ["ACTIVE", "WITHDRAWN"],
  ACTIVE: ["SUSPENDED", "WITHDRAWN", "GRADUATED"],
  SUSPENDED: ["ACTIVE", "WITHDRAWN"],
  WITHDRAWN: [],
  GRADUATED: [],
};

const STATUS_FILTERS: SchoolStudentStatus[] = ["APPLICANT", "ACTIVE", "SUSPENDED", "WITHDRAWN", "GRADUATED"];

export default async function SchoolStudentsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; q?: string; status?: string; page?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE);
  const statusFilter = STATUS_FILTERS.find((status) => status === query.status);
  const requestedPage = query.page && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 1;
  const [studentPage, guardians, campuses, guardianPhotoIds] = await Promise.all([
    listSchoolStudentPage(tenant.organizationId, { query: query.q, status: statusFilter, page: requestedPage }),
    listSchoolGuardians(tenant.organizationId),
    listSchoolCampuses(tenant.organizationId),
    listSchoolGuardianPhotoIds(tenant.organizationId),
  ]);

  const students = studentPage.rows;
  const studentPhotoIds = await listSchoolStudentPhotoIds(tenant.organizationId, students.map((student) => student.id));

  const campusOptions = campuses.map((campus) => ({ value: campus.id, label: campus.name }));
  const guardianOptions = guardians.map((guardian) => ({ value: guardian.id, label: `${guardian.lastName}, ${guardian.firstName} (${guardian.guardianNumber})` }));

  const newStudentDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />Admit student</Button>}
      title="Admit a student"
      description="Add the student and primary guardian together. Both records are saved only when the complete admission is valid."
      action={createStudentAction}
      submitLabel="Admit student"
    >
      <SelectField id="student-campus" name="campusId" label="Campus" required options={campusOptions} emptyHint="Create a campus before admitting students." />
      <FieldGrid>
        <TextField id="student-first-name" name="firstName" label="First name" required maxLength={200} />
        <TextField id="student-last-name" name="lastName" label="Last name" required maxLength={200} />
      </FieldGrid>
      <FieldGrid>
        <TextField id="student-dob" name="dateOfBirth" label="Date of birth" type="date" hint="Optional." />
        <SelectField id="student-gender" name="gender" label="Gender" hint="Optional." options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Other", label: "Other" }]} />
      </FieldGrid>
      <TextField id="student-admission-date" name="admissionDate" label="Admission date" type="date" hint="Optional. Defaults to unset." />
      <div className="space-y-1.5">
        <Label htmlFor="student-medical-notes">Medical notes</Label>
        <Textarea id="student-medical-notes" name="medicalNotes" rows={3} maxLength={5000} />
        <p className="text-xs leading-relaxed text-muted-foreground">Optional. Allergies, conditions, or safeguarding notes staff must know.</p>
      </div>
      <StudentGuardianFields guardianOptions={guardianOptions} />
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Students & Guardians"
        description="Admissions, student records, family relationships, and safeguarding contacts."
        actions={canManage ? newStudentDialog : undefined}
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="Student or family contact saved."
        stateMessage="That status change isn't allowed from the student's current status: withdrawn and graduated records are final."
      />
      {!canManage ? <ReadOnlyNotice>Your role can review students and guardians but cannot admit or change them.</ReadOnlyNotice> : null}
      <PrerequisiteNotice items={[{ satisfied: campuses.length > 0, label: "Create a campus", href: "/app/school/campuses" }]} />

      <Tabs defaultValue="students" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="guardians">Guardians</TabsTrigger>
        </TabsList>

        {/*
          With no students on record at all, one empty state inside this tab
          is the whole answer. This page used to say nothing is here three
          times over: an empty state above the tabs, then "0 students on
          record", then "No students match this search", with a search box
          and a status filter over an empty set in between. The search and
          the table belong here once there is something to search, and the
          empty state sits inside the tab so the panel is never blank.
        */}
        <TabsContent value="students" className="space-y-6">
          {studentPage.total === 0 ? (
            <EmptyState
              icon={Users}
              title="No students yet"
              description="Admitted students appear here with their campus, status, and guardian contacts."
              action={canManage && campuses.length > 0 ? newStudentDialog : undefined}
            />
          ) : (
          <SectionCard title="Students" description={`${studentPage.total} student${studentPage.total === 1 ? "" : "s"} on record.`}>
            <div className="space-y-4">
              <RecordSearch
                action={PATH}
                label="Search students"
                placeholder="Name or admission number"
                defaultValue={query.q}
                isFiltered={Boolean(query.q || statusFilter)}
                resultSummary={`Showing ${students.length} of ${studentPage.total}`}
                filters={
                  <div className="w-40 space-y-1.5">
                    <Label htmlFor="student-status-filter">Status</Label>
                    <select
                      id="student-status-filter"
                      name="status"
                      defaultValue={statusFilter ?? ""}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                    >
                      <option value="">All statuses</option>
                      {STATUS_FILTERS.map((status) => <option key={status} value={status}>{humanizeStatus(status)}</option>)}
                    </select>
                  </div>
                }
              />

              {students.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No students match this search.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><span className="sr-only">Photo</span></TableHead>
                      <TableHead>Admission no.</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead className="hidden md:table-cell">Campus</TableHead>
                      <TableHead className="hidden lg:table-cell">Class</TableHead>
                      <TableHead className="hidden lg:table-cell">Primary guardian</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => {
                      const primaryGuardian = student.guardians.find((link) => link.primary) ?? student.guardians[0];
                      const activeEnrollment = student.enrollments.find((enrollment) => enrollment.status === "ACTIVE");
                      const transitions = ALLOWED_TRANSITIONS[student.status];
                      const hasPhoto = studentPhotoIds.has(student.id);
                      return (
                        <TableRow key={student.id}>
                          <TableCell>
                            {canManage ? (
                              <EntityDialog
                                trigger={<button type="button" className="cursor-pointer"><PhotoThumb hasPhoto={hasPhoto} src={`/api/school/students/${student.id}/photo`} alt={`${student.firstName} ${student.lastName}`} /></button>}
                                title={`${hasPhoto ? "Replace" : "Add"} photo for ${student.firstName} ${student.lastName}`}
                                action={updateStudentPhotoAction}
                                submitLabel="Save photo"
                              >
                                <input type="hidden" name="studentId" value={student.id} />
                                {hasPhoto ? (
                                  <div className="flex items-center gap-3 rounded-md border p-2">
                                    <Image src={`/api/school/students/${student.id}/photo`} alt="" width={56} height={56} unoptimized className="size-14 rounded-md object-cover" />
                                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removePhoto" />Remove current photo</label>
                                  </div>
                                ) : null}
                                <PhotoInputPreview id={`student-photo-${student.id}`} />
                              </EntityDialog>
                            ) : (
                              <PhotoThumb hasPhoto={hasPhoto} src={`/api/school/students/${student.id}/photo`} alt={`${student.firstName} ${student.lastName}`} />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{student.admissionNumber}</TableCell>
                          <TableCell>
                            <div className="space-y-1.5">
                              <span className="block font-medium">{student.firstName} {student.lastName}</span>
                              <Link href={`/app/school/students/${student.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label={`View profile for ${student.firstName} ${student.lastName}`}>
                                <Eye className="size-3.5" /> View profile
                              </Link>
                              <span className="block text-xs text-muted-foreground md:hidden">{student.campus.name}</span>
                              {student.dateOfBirth ? <span className="block text-xs text-muted-foreground">Born {formatDate(student.dateOfBirth)}</span> : null}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{student.campus.name}</TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">
                            {activeEnrollment ? `${activeEnrollment.class.name} · ${activeEnrollment.academicYear.name}` : "Not enrolled"}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">
                            {primaryGuardian ? `${primaryGuardian.guardian.firstName} ${primaryGuardian.guardian.lastName} · ${primaryGuardian.guardian.phone}` : "None linked"}
                          </TableCell>
                          <TableCell><StatusBadge status={student.status} /></TableCell>
                          {canManage ? (
                            <TableCell className="text-right">
                              <div className="flex flex-wrap justify-end gap-2">
                                <EntityDialog
                                  trigger={<Button size="sm" variant="outline"><Pencil />Edit profile</Button>}
                                  title={`Edit ${student.firstName} ${student.lastName}`}
                                  description="Update the student's name, date of birth, gender, or admission date. Campus, admission number, status, and class history remain unchanged."
                                  action={updateStudentProfileAction}
                                  submitLabel="Save profile"
                                >
                                  <input type="hidden" name="studentId" value={student.id} />
                                  <input type="hidden" name="updatedAt" value={student.updatedAt.toISOString()} />
                                  <input type="hidden" name="q" value={query.q ?? ""} />
                                  <input type="hidden" name="status" value={statusFilter ?? ""} />
                                  <input type="hidden" name="page" value={studentPage.page} />
                                  <FieldGrid>
                                    <TextField id={`student-edit-first-${student.id}`} name="firstName" label="First name" required maxLength={200} defaultValue={student.firstName} />
                                    <TextField id={`student-edit-last-${student.id}`} name="lastName" label="Last name" required maxLength={200} defaultValue={student.lastName} />
                                  </FieldGrid>
                                  <FieldGrid>
                                    <TextField id={`student-edit-dob-${student.id}`} name="dateOfBirth" label="Date of birth" type="date" defaultValue={student.dateOfBirth?.toISOString().slice(0, 10) ?? ""} />
                                    <TextField id={`student-edit-gender-${student.id}`} name="gender" label="Gender" maxLength={100} defaultValue={student.gender ?? ""} />
                                  </FieldGrid>
                                  <TextField id={`student-edit-admission-date-${student.id}`} name="admissionDate" label="Admission date" type="date" defaultValue={student.admissionDate?.toISOString().slice(0, 10) ?? ""} />
                                </EntityDialog>
                                <EntityDialog
                                  trigger={<Button size="sm" variant="outline"><Users />Family links</Button>}
                                  title={`Family contacts for ${student.firstName} ${student.lastName}`}
                                  description="Choose the primary contact, record pickup authorization, link another guardian, or remove an outdated relationship. A student must keep one primary contact while linked guardians remain."
                                  action={manageStudentGuardiansAction}
                                  submitLabel="Save family links"
                                  contentClassName="sm:max-w-2xl"
                                >
                                  <input type="hidden" name="studentId" value={student.id} />
                                  <input type="hidden" name="q" value={query.q ?? ""} />
                                  <input type="hidden" name="status" value={statusFilter ?? ""} />
                                  <input type="hidden" name="page" value={studentPage.page} />
                                  {student.guardians.length ? (
                                    <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                                      {student.guardians.map((link, index) => (
                                        <fieldset key={link.guardianId} className="space-y-3 rounded-lg border p-3">
                                          <legend className="px-1 text-sm font-medium">{link.guardian.firstName} {link.guardian.lastName} · {link.guardian.phone}</legend>
                                          <input type="hidden" name="linkedGuardianId" value={link.guardianId} />
                                          <TextField id={`family-relationship-${student.id}-${link.guardianId}`} name={`relationship_${link.guardianId}`} label="Relationship" required maxLength={200} defaultValue={link.relationship} />
                                          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                                            <label className="inline-flex items-center gap-2"><input type="radio" name="primaryGuardianId" value={link.guardianId} defaultChecked={link.primary || (!student.guardians.some((item) => item.primary) && index === 0)} />Primary contact</label>
                                            <label className="inline-flex items-center gap-2"><input type="checkbox" name="pickupGuardianId" value={link.guardianId} defaultChecked={link.authorizedPickup} />Authorized to pick up</label>
                                            <label className="inline-flex items-center gap-2 text-destructive"><input type="checkbox" name="removeGuardianId" value={link.guardianId} />Remove this link</label>
                                          </div>
                                        </fieldset>
                                      ))}
                                    </div>
                                  ) : <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No guardian is linked yet. Choose one below and mark them as the primary contact.</p>}
                                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                                    <p className="text-sm font-medium">Link another guardian</p>
                                    <SelectField
                                      id={`family-add-guardian-${student.id}`}
                                      name="newGuardianId"
                                      label="Guardian"
                                      options={guardianOptions.filter((option) => !student.guardians.some((link) => link.guardianId === option.value))}
                                      placeholder="Leave empty to skip"
                                    />
                                    <TextField id={`family-new-relationship-${student.id}`} name="newRelationship" label="Relationship" maxLength={200} />
                                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                                      <label className="inline-flex items-center gap-2"><input type="radio" name="primaryGuardianId" value="new" defaultChecked={student.guardians.length === 0} />Make the new guardian primary</label>
                                      <label className="inline-flex items-center gap-2"><input type="checkbox" name="newAuthorizedPickup" />Authorize pickup</label>
                                    </div>
                                  </div>
                                </EntityDialog>
                                {transitions.length > 0 ? (
                                  <EntityDialog
                                    trigger={<Button size="sm" variant="ghost">Change status</Button>}
                                    title={`Change status for ${student.firstName} ${student.lastName}`}
                                    description={`Currently ${humanizeStatus(student.status).toLowerCase()}. Withdrawing or graduating a student also closes their active enrollments.`}
                                    action={transitionStudentAction}
                                    submitLabel="Change status"
                                  >
                                    <input type="hidden" name="studentId" value={student.id} />
                                    <SelectField
                                      id={`transition-${student.id}`}
                                      name="toStatus"
                                      label="New status"
                                      required
                                      placeholder="Select a new status…"
                                      options={transitions.map((status) => ({ value: status, label: humanizeStatus(status) }))}
                                    />
                                    <div className="space-y-1.5">
                                      <Label htmlFor={`transition-reason-${student.id}`}>Reason</Label>
                                      <Textarea id={`transition-reason-${student.id}`} name="reason" rows={3} maxLength={5000} />
                                      <p className="text-xs leading-relaxed text-muted-foreground">Optional, but recorded permanently in the student&apos;s lifecycle history.</p>
                                    </div>
                                  </EntityDialog>
                                ) : <span className="self-center text-xs text-muted-foreground">Final status</span>}
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <RecordPagination path={PATH} page={studentPage.page} pageCount={studentPage.pageCount} filters={{ q: query.q, status: statusFilter }} label="Student list" />
            </div>
          </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="guardians" className="space-y-6">
          <SectionCard
            title="Guardians"
            description={`${guardians.length} guardian${guardians.length === 1 ? "" : "s"} on record.`}
            actions={canManage ? (
              <EntityDialog trigger={<Button size="sm"><Plus />Add guardian</Button>} title="Add a guardian" description="Create a guardian record first, then link them to one or more students from the Family links action." action={createGuardianAction} submitLabel="Save guardian">
                <FieldGrid>
                  <TextField id="guardian-new-first" name="firstName" label="First name" required maxLength={200} />
                  <TextField id="guardian-new-last" name="lastName" label="Last name" required maxLength={200} />
                </FieldGrid>
                <FieldGrid>
                  <TextField id="guardian-new-phone" name="phone" label="Phone" type="tel" required maxLength={200} />
                  <TextField id="guardian-new-email" name="email" label="Email" type="email" maxLength={320} />
                </FieldGrid>
                <TextField id="guardian-new-occupation" name="occupation" label="Occupation" maxLength={200} />
                <div className="space-y-1.5"><Label htmlFor="guardian-new-address">Address</Label><Textarea id="guardian-new-address" name="address" rows={3} maxLength={5000} /></div>
              </EntityDialog>
            ) : undefined}
          >
            {guardians.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No guardians yet. A primary guardian is created automatically during the first student admission.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><span className="sr-only">Photo</span></TableHead>
                    <TableHead>Guardian no.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="hidden lg:table-cell">Occupation</TableHead>
                    {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guardians.map((guardian) => {
                    const hasPhoto = guardianPhotoIds.has(guardian.id);
                    return (
                      <TableRow key={guardian.id}>
                        <TableCell>
                          {canManage ? (
                            <EntityDialog
                              trigger={<button type="button" className="cursor-pointer"><PhotoThumb hasPhoto={hasPhoto} src={`/api/school/guardians/${guardian.id}/photo`} alt={`${guardian.firstName} ${guardian.lastName}`} /></button>}
                              title={`${hasPhoto ? "Replace" : "Add"} photo for ${guardian.firstName} ${guardian.lastName}`}
                              action={updateGuardianPhotoAction}
                              submitLabel="Save photo"
                            >
                              <input type="hidden" name="guardianId" value={guardian.id} />
                              {hasPhoto ? (
                                <div className="flex items-center gap-3 rounded-md border p-2">
                                  <Image src={`/api/school/guardians/${guardian.id}/photo`} alt="" width={56} height={56} unoptimized className="size-14 rounded-md object-cover" />
                                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removePhoto" />Remove current photo</label>
                                </div>
                              ) : null}
                              <div className="space-y-1.5">
                                <Label htmlFor={`guardian-photo-${guardian.id}`}>Photo</Label>
                                <Input id={`guardian-photo-${guardian.id}`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
                                <p className="text-xs text-muted-foreground">Optional JPG, PNG, or WebP, up to 1 MB.</p>
                              </div>
                            </EntityDialog>
                          ) : (
                            <PhotoThumb hasPhoto={hasPhoto} src={`/api/school/guardians/${guardian.id}/photo`} alt={`${guardian.firstName} ${guardian.lastName}`} />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{guardian.guardianNumber}</TableCell>
                        <TableCell className="font-medium">{guardian.firstName} {guardian.lastName}</TableCell>
                        <TableCell className="text-muted-foreground">{guardian.phone}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">{guardian.email ?? "-"}</TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">{guardian.occupation ?? "-"}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <EntityDialog
                              trigger={<Button size="sm" variant="outline"><Pencil />Edit details</Button>}
                              title={`Edit ${guardian.firstName} ${guardian.lastName}`}
                              description="Update this guardian's contact and personal details. Linked students are preserved."
                              action={updateGuardianAction}
                              submitLabel="Save guardian"
                            >
                              <input type="hidden" name="guardianId" value={guardian.id} />
                              <FieldGrid>
                                <TextField id={`guardian-first-${guardian.id}`} name="firstName" label="First name" required defaultValue={guardian.firstName} maxLength={200} />
                                <TextField id={`guardian-last-${guardian.id}`} name="lastName" label="Last name" required defaultValue={guardian.lastName} maxLength={200} />
                              </FieldGrid>
                              <FieldGrid>
                                <TextField id={`guardian-phone-${guardian.id}`} name="phone" label="Phone" type="tel" required defaultValue={guardian.phone} maxLength={200} />
                                <TextField id={`guardian-email-${guardian.id}`} name="email" label="Email" type="email" defaultValue={guardian.email ?? ""} maxLength={320} />
                              </FieldGrid>
                              <TextField id={`guardian-occupation-${guardian.id}`} name="occupation" label="Occupation" defaultValue={guardian.occupation ?? ""} maxLength={200} />
                              <div className="space-y-1.5"><Label htmlFor={`guardian-address-${guardian.id}`}>Address</Label><Textarea id={`guardian-address-${guardian.id}`} name="address" rows={3} defaultValue={guardian.address ?? ""} maxLength={5000} /></div>
                            </EntityDialog>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
