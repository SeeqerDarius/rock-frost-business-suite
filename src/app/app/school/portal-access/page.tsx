import Link from "next/link";
import { ArrowLeft, KeyRound, Lock, Search, ShieldOff, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { ReadOnlyNotice } from "@/components/school/form-feedback";
import { TextField } from "@/components/school/form-fields";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { isSchoolPortalGranted } from "@/lib/platform-communications";
import { getSchoolPortalAccessOverview, listSchoolPortalAccessStudents } from "@/modules/school/service";
import { inviteGuardianToPortalAction, inviteStudentToPortalAction, resendPortalInvitationAction, revokePortalAccessAction } from "./actions";

const PATH = "/app/school/portal-access";
const MESSAGES: Record<string, string> = {
  forbidden: "Your role cannot manage portal access.",
  invalid: "Enter a valid record and email address.",
  "not-found": "That record could not be found.",
  "already-linked": "That record already has a portal login.",
  "already-active": "That email address already has an active membership in this organization.",
  "invalid-user": "That email belongs to a platform account and cannot be linked here.",
  "guardian-no-email": "Add an email address to this guardian's profile before inviting them.",
  "delivery-failed": "The invitation email could not be delivered. You can resend it from this class.",
  "resend-unavailable": "This invitation is no longer pending or was resent less than a minute ago.",
  "revoke-unavailable": "The invitation changed before it could be revoked. Refresh this class and check the account status.",
  "not-granted": "The Parent/Student portal is not enabled for your organization. Contact Rock Frost to have it enabled.",
};

type PortalAccessStudent = Awaited<ReturnType<typeof listSchoolPortalAccessStudents>>[number];
type PortalMember = {
  id: string;
  userId: string;
  status: string;
  role: { name: string } | null;
  invitation: { status: string; lastDeliveryFailed: boolean; expiresAt: Date } | null;
  user: { email: string };
};

function statusLabel(userId: string | null, member: PortalMember | undefined) {
  if (!userId) return "Not invited";
  if (!member) return "Access needs review";
  if (member.status === "ACTIVE") return "Active";
  if (member.status === "INVITED") return "Invitation pending";
  if (member.status === "SUSPENDED") return "Suspended";
  return "Access needs review";
}

function AccountState({ userId, member }: { userId: string | null; member: PortalMember | undefined }) {
  const label = statusLabel(userId, member);
  return <div className="space-y-1">
    <Badge variant={label === "Active" ? "default" : "outline"}>{label}</Badge>
    {member ? <p className="break-all text-xs text-muted-foreground">{member.user.email}</p> : null}
    {member?.status === "INVITED" && member.invitation?.lastDeliveryFailed ? <p className="text-xs text-destructive">Invitation email delivery failed</p> : null}
    {member?.status === "INVITED" && member.invitation?.expiresAt ? <p className="text-xs text-muted-foreground">Expires {member.invitation.expiresAt.toLocaleDateString()}</p> : null}
  </div>;
}

function AccountActions({ kind, recordId, userId, member, canManage, classId, unassigned, query, children }: {
  kind: "student" | "guardian";
  recordId: string;
  userId: string | null;
  member: PortalMember | undefined;
  canManage: boolean;
  classId?: string;
  unassigned: boolean;
  query: string;
  children: React.ReactNode;
}) {
  if (!canManage) return null;
  if (!userId) return <div className="shrink-0">{children}</div>;
  return <div className="flex shrink-0 flex-wrap items-center gap-2">
    {member?.status === "INVITED" ? <form action={resendPortalInvitationAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="recordId" value={recordId} />
      {classId ? <input type="hidden" name="returnClassId" value={classId} /> : null}
      {unassigned ? <input type="hidden" name="returnGroup" value="unassigned" /> : null}
      {query ? <input type="hidden" name="returnQuery" value={query} /> : null}
      <Button type="submit" size="sm" variant="outline" className="min-h-11 sm:min-h-9">Resend invite</Button>
    </form> : null}
    <form action={revokePortalAccessAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="recordId" value={recordId} />
      {classId ? <input type="hidden" name="returnClassId" value={classId} /> : null}
      {unassigned ? <input type="hidden" name="returnGroup" value="unassigned" /> : null}
      {query ? <input type="hidden" name="returnQuery" value={query} /> : null}
      <Button type="submit" size="sm" variant="outline" className="min-h-11 sm:min-h-9">Revoke access</Button>
    </form>
  </div>;
}

export default async function SchoolPortalAccessPage({ searchParams }: { searchParams: Promise<{ classId?: string; group?: string; q?: string; invited?: string; saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canView = hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENT_PROFILE_VIEW);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE);

  if (!canView) {
    return <div className="mx-auto max-w-screen-lg space-y-6">
      <PageHeader title="Portal access" description="Manage student and guardian self-service accounts by class." />
      <EmptyState icon={Lock} title="Portal access management is restricted" description="Your role does not include School student management." />
    </div>;
  }

  if (!(await isSchoolPortalGranted(tenant.organizationId))) {
    return <div className="mx-auto max-w-screen-lg space-y-6">
      <PageHeader title="Portal access" description="Manage student and guardian self-service accounts by class." />
      <EmptyState icon={ShieldOff} title="Not available for your organization" description="The Parent/Student portal is a paid add-on. Contact Rock Frost to have it enabled for your organization." />
    </div>;
  }

  const overview = await getSchoolPortalAccessOverview(tenant.organizationId);
  const isUnassigned = query.group === "unassigned";
  const selectedClass = query.classId ? overview.classes.find((class_) => class_.id === query.classId) : null;
  const hasSelection = isUnassigned || Boolean(query.classId);
  const invalidSelection = hasSelection && (isUnassigned ? overview.unassignedCount === 0 : !selectedClass);
  const students = overview.academicYear && hasSelection && !invalidSelection
    ? await listSchoolPortalAccessStudents(tenant.organizationId, overview.academicYear.id, { classId: selectedClass?.id, unassigned: isUnassigned, query: query.q })
    : [];
  const userIds = [...new Set(students.flatMap((student) => [
    ...(student.userId ? [student.userId] : []),
    ...student.guardians.flatMap((link) => link.guardian.userId ? [link.guardian.userId] : []),
  ]))];
  const members = userIds.length ? await db.organizationMember.findMany({
    where: { organizationId: tenant.organizationId, userId: { in: userIds }, role: { name: { in: ["Parent", "Student"] } } },
    select: { id: true, userId: true, status: true, role: { select: { name: true } }, user: { select: { email: true } }, invitation: { select: { status: true, lastDeliveryFailed: true, expiresAt: true } } },
  }) : [];
  const memberByUserId = new Map<string, PortalMember>(members.map((member) => [member.userId, member]));
  const currentStudentCount = overview.classes.reduce((total, class_) => total + class_._count.enrollments, 0);
  const classesByCampus = new Map<string, { campusName: string; classes: Array<{ id: string; name: string; active: boolean; campus: { id: string; name: string }; _count: { enrollments: number } }> }>();
  for (const class_ of overview.classes) {
    const campusGroup = classesByCampus.get(class_.campus.id) ?? { campusName: class_.campus.name, classes: [] };
    campusGroup.classes.push(class_);
    classesByCampus.set(class_.campus.id, campusGroup);
  }
  const cleanQuery = query.q?.trim().slice(0, 100) ?? "";

  return <div className="mx-auto max-w-screen-lg space-y-6">
    <PageHeader title="Portal access" description="Choose a class to manage student and guardian sign-in. Student details appear only after you open a class." />
    {query.invited ? <p role="status" className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Invitation email sent. They can activate portal access from the secure link.</p> : null}
    {query.saved ? <p role="status" className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Portal access updated.</p> : null}
    {query.error && MESSAGES[query.error] ? <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{MESSAGES[query.error]}</p> : null}
    {!canManage ? <ReadOnlyNotice>You can review account status but cannot send invitations or revoke access.</ReadOnlyNotice> : null}

    {!overview.academicYear ? <EmptyState icon={KeyRound} title="Set a current academic year" description="Portal accounts are grouped by active class enrollment in the current academic year. Set the current year before managing student access." action={<Button nativeButton={false} render={<Link href="/app/school/academic-periods" />}>Open academic periods</Button>} /> : null}

    {overview.academicYear && !hasSelection ? <>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Current year portal access overview">
        <Card><CardContent className="flex items-center justify-between p-4"><span className="text-sm text-muted-foreground">Current academic year</span><span className="text-right text-sm font-semibold">{overview.academicYear.name}</span></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4"><span className="text-sm text-muted-foreground">Classes with active students</span><span className="text-xl font-semibold tabular-nums">{overview.classes.length}</span></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between p-4"><span className="text-sm text-muted-foreground">Active students in classes</span><span className="text-xl font-semibold tabular-nums">{currentStudentCount}</span></CardContent></Card>
      </div>
      {overview.classes.length === 0 && overview.unassignedCount === 0 ? <EmptyState icon={UsersRound} title="No active students to manage" description="Active student accounts will appear here after they are enrolled in a class for the current year." /> : null}
      <div className="space-y-6" aria-label="Classes for portal access">
        {[...classesByCampus.entries()].map(([campusId, campusGroup]) => <section key={campusId} className="space-y-3">
          <div><h2 className="text-lg font-semibold">{campusGroup.campusName}</h2><p className="text-sm text-muted-foreground">Choose a class to review its student and guardian accounts.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{campusGroup.classes.map((class_) => <Link key={class_.id} href={`${PATH}?classId=${encodeURIComponent(class_.id)}`} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold group-hover:text-primary">{class_.name}</h3><p className="mt-1 text-sm text-muted-foreground">{class_._count.enrollments} active student{class_._count.enrollments === 1 ? "" : "s"}</p></div><UsersRound className="size-5 text-muted-foreground" aria-hidden="true" /></div>
            {!class_.active ? <Badge variant="outline" className="mt-3">Inactive class</Badge> : null}
          </Link>)}</div>
        </section>)}
        {overview.unassignedCount > 0 ? <section className="space-y-3"><div><h2 className="text-lg font-semibold">Needs class assignment</h2><p className="text-sm text-muted-foreground">These active students have no active enrollment for {overview.academicYear.name}.</p></div><Link href={`${PATH}?group=unassigned`} className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div><p className="font-medium">Unassigned students</p><p className="mt-1 text-sm text-muted-foreground">Review portal links or assign them to a class.</p></div><Badge variant="outline">{overview.unassignedCount}</Badge></Link></section> : null}
      </div>
    </> : null}

    {overview.academicYear && hasSelection ? <>
      <Button nativeButton={false} variant="ghost" render={<Link href={PATH} />}><ArrowLeft className="size-4" />All classes</Button>
      {invalidSelection ? <EmptyState icon={UsersRound} title="Class group not found" description="This class has no active students in the current academic year, or the link is no longer available." action={<Button nativeButton={false} render={<Link href={PATH} />}>Return to classes</Button>} /> : <>
        <section className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{overview.academicYear.name}</p>
          <h2 className="mt-1 text-xl font-semibold">{isUnassigned ? "Needs class assignment" : selectedClass?.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{isUnassigned ? `${students.length} active student${students.length === 1 ? "" : "s"} without a current class` : `${selectedClass?.campus.name} · ${students.length} active student${students.length === 1 ? "" : "s"}`}</p>
        </section>
        <form method="get" action={PATH} role="search" className="flex flex-col gap-2 sm:flex-row">
          {selectedClass ? <input type="hidden" name="classId" value={selectedClass.id} /> : <input type="hidden" name="group" value="unassigned" />}
          <label htmlFor="portal-student-search" className="sr-only">Search this class</label>
          <input id="portal-student-search" name="q" type="search" defaultValue={cleanQuery} placeholder="Search by student name or admission number" className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm" />
          <Button type="submit" variant="outline" className="h-10"><Search className="size-4" />Search class</Button>
          {cleanQuery ? <Button nativeButton={false} variant="ghost" render={<Link href={isUnassigned ? `${PATH}?group=unassigned` : `${PATH}?classId=${encodeURIComponent(selectedClass!.id)}`} />}>Clear</Button> : null}
        </form>
        {students.length === 0 ? <EmptyState icon={UsersRound} title={cleanQuery ? "No students match this search" : "No students in this group"} description={cleanQuery ? "Try another name or admission number." : "There are no active student records to manage in this group."} /> : <div className="space-y-4">
          {students.map((student: PortalAccessStudent) => {
            const studentMember = student.userId ? memberByUserId.get(student.userId) : undefined;
            return <Card key={student.id}>
              <CardContent className="space-y-3 p-3 sm:p-4">
                <div className="border-b pb-3">
                  <CardTitle className="text-base">{student.firstName} {student.lastName}</CardTitle>
                  <CardDescription>Admission {student.admissionNumber} · {student.campus.name}</CardDescription>
                </div>
                <section aria-label={`Student portal account for ${student.firstName} ${student.lastName}`} className="flex flex-col justify-between gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center">
                  <div className="min-w-0"><p className="text-sm font-medium">Student sign-in</p><AccountState userId={student.userId} member={studentMember} /></div>
                  <AccountActions kind="student" recordId={student.id} userId={student.userId} member={studentMember} canManage={canManage} classId={selectedClass?.id} unassigned={isUnassigned} query={cleanQuery}>{student.userId ? null : <EntityDialog trigger={<Button type="button" size="sm" className="min-h-11 sm:min-h-9">Invite student</Button>} title={`Invite ${student.firstName} to the student portal`} description="They will receive a secure email link to set their password." action={inviteStudentToPortalAction} submitLabel="Send invitation"><input type="hidden" name="studentId" value={student.id} />{selectedClass ? <input type="hidden" name="returnClassId" value={selectedClass.id} /> : <input type="hidden" name="returnGroup" value="unassigned" />}{cleanQuery ? <input type="hidden" name="returnQuery" value={cleanQuery} /> : null}<TextField id={`student-portal-email-${student.id}`} name="email" label="Student email" type="email" required /></EntityDialog>}</AccountActions>
                </section>
                <section className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><h3 className="text-sm font-semibold">Guardian accounts</h3><p className="text-xs text-muted-foreground">Linked guardians can sign in to see their children.</p></div>
                  {student.guardians.length === 0 ? <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">No guardians are linked to this student yet.</p> : <div className="space-y-2">{student.guardians.map((link) => {
                    const guardianMember = link.guardian.userId ? memberByUserId.get(link.guardian.userId) : undefined;
                    return <div key={link.guardianId} className="flex flex-col justify-between gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-medium">{link.guardian.firstName} {link.guardian.lastName} <span className="font-normal text-muted-foreground">({link.relationship})</span></p><AccountState userId={link.guardian.userId} member={guardianMember} />{!link.guardian.userId && !link.guardian.email ? <p className="mt-1 text-xs text-amber-700">Add an email address to this guardian record before inviting them.</p> : null}</div><AccountActions kind="guardian" recordId={link.guardian.id} userId={link.guardian.userId} member={guardianMember} canManage={canManage} classId={selectedClass?.id} unassigned={isUnassigned} query={cleanQuery}>{link.guardian.userId || !link.guardian.email ? null : <form action={inviteGuardianToPortalAction}><input type="hidden" name="guardianId" value={link.guardian.id} />{selectedClass ? <input type="hidden" name="returnClassId" value={selectedClass.id} /> : <input type="hidden" name="returnGroup" value="unassigned" />}{cleanQuery ? <input type="hidden" name="returnQuery" value={cleanQuery} /> : null}<Button type="submit" size="sm" className="min-h-11 sm:min-h-9">Invite guardian</Button></form>}</AccountActions></div>;
                  })}</div>}
                </section>
              </CardContent>
            </Card>;
          })}
        </div>}
      </>}
    </> : null}
  </div>;
}
