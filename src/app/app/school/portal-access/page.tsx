import { KeyRound, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/school/section-card";
import { ReadOnlyNotice } from "@/components/school/form-feedback";
import { TextField } from "@/components/school/form-fields";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSchoolStudents } from "@/modules/school/service";
import { inviteGuardianToPortalAction, inviteStudentToPortalAction, revokePortalAccessAction } from "./actions";

const MESSAGES: Record<string, string> = {
  forbidden: "Your role cannot manage portal access.",
  invalid: "Enter a valid record and email address.",
  "not-found": "That record could not be found.",
  "already-linked": "That record already has a portal login.",
  "already-active": "That email address already has an active membership in this organization.",
  "invalid-user": "That email belongs to a platform account and cannot be linked here.",
  "guardian-no-email": "Add an email address to this guardian's profile before inviting them.",
  "delivery-failed": "The account was created, but the invitation email could not be delivered.",
};

export default async function SchoolPortalAccessPage({ searchParams }: { searchParams: Promise<{ invited?: string; saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canView = hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENT_PROFILE_VIEW);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE);

  if (!canView) {
    return (
      <div className="mx-auto max-w-screen-lg space-y-6">
        <PageHeader title="Portal Access" description="Invite guardians and students to the self-service parent/student portal." />
        <EmptyState icon={Lock} title="Portal access management is restricted" description="Your role does not include School student management." />
      </div>
    );
  }

  const students = await listSchoolStudents(tenant.organizationId);
  const activeStudents = students.filter((student) => student.status === "ACTIVE");

  return (
    <div className="mx-auto max-w-screen-lg space-y-6">
      <PageHeader title="Portal Access" description="Invite a student's guardian, or the student themselves, to sign in and see attendance, results, fees, and their digital ID." />

      {query.invited ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Invitation sent. They can use the emailed link to activate their portal account.</p> : null}
      {query.saved ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Portal access updated.</p> : null}
      {query.error && MESSAGES[query.error] ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{MESSAGES[query.error]}</p> : null}
      {!canManage ? <ReadOnlyNotice>You can review portal access but cannot invite or revoke it.</ReadOnlyNotice> : null}

      {activeStudents.length === 0 ? (
        <EmptyState icon={KeyRound} title="No active students yet" description="Admit at least one active student before setting up portal access." />
      ) : (
        activeStudents.map((student) => (
          <SectionCard key={student.id} title={`${student.firstName} ${student.lastName}`} description={`Admission ${student.admissionNumber} · ${student.campus.name}`}>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Student portal (self-login)</p>
                  <p className="text-xs text-muted-foreground">{student.userId ? "Linked" : "Not linked"}</p>
                </div>
                {canManage ? (
                  student.userId ? (
                    <form action={revokePortalAccessAction}><input type="hidden" name="kind" value="student" /><input type="hidden" name="recordId" value={student.id} /><Button type="submit" size="sm" variant="outline">Revoke</Button></form>
                  ) : (
                    <EntityDialog trigger={<Button type="button" size="sm">Invite student</Button>} title={`Invite ${student.firstName} to the student portal`} description="They'll receive an emailed link to set their own password." action={inviteStudentToPortalAction} submitLabel="Send invitation">
                      <input type="hidden" name="studentId" value={student.id} />
                      <TextField id={`student-portal-email-${student.id}`} name="email" label="Student email" type="email" required />
                    </EntityDialog>
                  )
                ) : (
                  <Badge variant={student.userId ? "default" : "outline"}>{student.userId ? "Linked" : "Not linked"}</Badge>
                )}
              </div>

              {student.guardians.length === 0 ? (
                <p className="text-sm text-muted-foreground">No guardians linked to this student yet.</p>
              ) : (
                student.guardians.map((link) => (
                  <div key={link.guardianId} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{link.guardian.firstName} {link.guardian.lastName} ({link.relationship})</p>
                      <p className="text-xs text-muted-foreground">{link.guardian.userId ? "Linked" : link.guardian.email ? "Not linked" : "No email on file"}</p>
                    </div>
                    {canManage ? (
                      link.guardian.userId ? (
                        <form action={revokePortalAccessAction}><input type="hidden" name="kind" value="guardian" /><input type="hidden" name="recordId" value={link.guardian.id} /><Button type="submit" size="sm" variant="outline">Revoke</Button></form>
                      ) : (
                        <form action={inviteGuardianToPortalAction}>
                          <input type="hidden" name="guardianId" value={link.guardian.id} />
                          <Button type="submit" size="sm" disabled={!link.guardian.email}>Invite to parent portal</Button>
                        </form>
                      )
                    ) : (
                      <Badge variant={link.guardian.userId ? "default" : "outline"}>{link.guardian.userId ? "Linked" : "Not linked"}</Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        ))
      )}
    </div>
  );
}
