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
import { StatusBadge } from "@/components/school/status-badge";
import { formatDate, humanizeStatus } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSchoolCampuses, listSchoolGuardians, listSchoolStudents, listSchoolStudentPhotoIds, listSchoolGuardianPhotoIds } from "@/modules/school/service";
import { createStudentAction, transitionStudentAction, updateStudentPhotoAction, updateGuardianAction, updateGuardianPhotoAction } from "../actions";
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

export default async function SchoolStudentsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; q?: string; status?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE);
  const [students, guardians, campuses, studentPhotoIds, guardianPhotoIds] = await Promise.all([
    listSchoolStudents(tenant.organizationId),
    listSchoolGuardians(tenant.organizationId),
    listSchoolCampuses(tenant.organizationId),
    listSchoolStudentPhotoIds(tenant.organizationId),
    listSchoolGuardianPhotoIds(tenant.organizationId),
  ]);

  // The service returns the full student list for the organization, so the
  // search and status filter are applied to the rows already loaded here.
  const search = query.q?.trim().toLowerCase() ?? "";
  const statusFilter = STATUS_FILTERS.find((status) => status === query.status);
  const visible = students.filter((student) => {
    const matchesSearch = search === "" || `${student.firstName} ${student.lastName} ${student.admissionNumber}`.toLowerCase().includes(search);
    return matchesSearch && (!statusFilter || student.status === statusFilter);
  });

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
        savedMessage="The student record is up to date."
        stateMessage="That status change isn't allowed from the student's current status: withdrawn and graduated records are final."
      />
      {!canManage ? <ReadOnlyNotice>Your role can review students and guardians but cannot admit or change them.</ReadOnlyNotice> : null}
      <PrerequisiteNotice items={[{ satisfied: campuses.length > 0, label: "Create a campus", href: "/app/school/campuses" }]} />

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Admitted students appear here with their campus, status, and guardian contacts."
          action={canManage && campuses.length > 0 ? newStudentDialog : undefined}
        />
      ) : null}

      <Tabs defaultValue="students" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="guardians">Guardians</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-6">
          <SectionCard title="Students" description={`${students.length} student${students.length === 1 ? "" : "s"} on record.`}>
            <div className="space-y-4">
              <RecordSearch
                action={PATH}
                label="Search students"
                placeholder="Name or admission number"
                defaultValue={query.q}
                isFiltered={Boolean(query.q || statusFilter)}
                resultSummary={`Showing ${visible.length} of ${students.length}`}
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

              {visible.length === 0 ? (
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
                    {visible.map((student) => {
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
                              ) : (
                                <span className="text-xs text-muted-foreground">Final</span>
                              )}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="guardians" className="space-y-6">
          <SectionCard title="Guardians" description={`${guardians.length} guardian${guardians.length === 1 ? "" : "s"} on record.`}>
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
