import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/school/print-button";
import { formatDate, humanizeStatus } from "@/components/school/format";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { SchoolNotFoundError } from "@/modules/school/service";
import { getSchoolStudentProfile } from "@/modules/school/student-profile-service";

export default async function SchoolStudentPrintPage({ params }: { params: Promise<{ studentId: string }> }) {
  const [{ studentId }, tenant] = await Promise.all([params, requireModuleAccess("school")]);
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENT_PROFILE_VIEW)) notFound();
  let student;
  try {
    student = await getSchoolStudentProfile(tenant.organizationId, studentId, tenant.userId, {
      medical: false,
      academic: false,
      finance: false,
      attendance: false,
      conduct: false,
      digitalId: false,
    });
  } catch (error) {
    if (error instanceof SchoolNotFoundError) notFound();
    throw error;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 print:max-w-none print:p-0">
      <div className="flex justify-end gap-2 print:hidden">
        <Button nativeButton={false} render={<Link href={`/app/school/students/${student.id}`} />} variant="outline">Back to profile</Button>
        <PrintButton />
      </div>
      <article className="space-y-6 rounded-xl border bg-background p-8 print:rounded-none print:border-none print:p-0">
        <header className="border-b pb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Student record</p>
          <h1 className="mt-1 text-2xl font-semibold">{student.firstName} {student.lastName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{student.admissionNumber} · {student.campus.name}</p>
        </header>

        <section className="grid gap-3 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Status</p><p className="font-medium">{humanizeStatus(student.status)}</p></div>
          <div><p className="text-xs text-muted-foreground">Admission date</p><p className="font-medium">{formatDate(student.admissionDate)}</p></div>
          <div><p className="text-xs text-muted-foreground">Date of birth</p><p className="font-medium">{formatDate(student.dateOfBirth)}</p></div>
        </section>

        <section className="space-y-2">
          <h2 className="border-b pb-2 text-lg font-semibold">Guardians</h2>
          {student.guardians.length ? student.guardians.map((link) => <div key={link.id} className="grid gap-1 border-b py-2 text-sm sm:grid-cols-3">
            <span className="font-medium">{link.guardian.firstName} {link.guardian.lastName}{link.primary ? " · Primary contact" : ""}</span>
            <span>{link.relationship}</span>
            <span>{link.guardian.phone ?? link.guardian.email ?? "Contact details not recorded"}</span>
          </div>) : <p className="text-sm text-muted-foreground">No guardians are linked.</p>}
        </section>

        <section className="space-y-2">
          <h2 className="border-b pb-2 text-lg font-semibold">Enrollment history</h2>
          {student.enrollments.length ? student.enrollments.map((enrollment) => <div key={enrollment.id} className="grid gap-1 border-b py-2 text-sm sm:grid-cols-4">
            <span className="font-medium">{enrollment.academicYear.name}</span>
            <span>{enrollment.class.name}</span>
            <span>{enrollment.campus.name}</span>
            <span>{humanizeStatus(enrollment.status)} · {formatDate(enrollment.enrolledAt)}</span>
          </div>) : <p className="text-sm text-muted-foreground">No enrollments are recorded.</p>}
        </section>

        <section className="space-y-2">
          <h2 className="border-b pb-2 text-lg font-semibold">Transfer history</h2>
          {student.transfers.length ? student.transfers.map((transfer) => <div key={transfer.id} className="border-b py-2 text-sm">
            <p className="font-medium">{transfer.sourceClass.name}, {transfer.sourceCampus.name} to {transfer.targetClass.name}, {transfer.targetCampus.name}</p>
            <p className="text-muted-foreground">{transfer.academicYear.name} · {formatDate(transfer.transferredAt)} · {transfer.reason}</p>
          </div>) : <p className="text-sm text-muted-foreground">No class transfers are recorded.</p>}
        </section>

        <section className="space-y-2">
          <h2 className="border-b pb-2 text-lg font-semibold">Status history</h2>
          {student.lifecycleEvents.length ? student.lifecycleEvents.map((event) => <div key={event.id} className="border-b py-2 text-sm">
            <p className="font-medium">{humanizeStatus(event.fromStatus)} to {humanizeStatus(event.toStatus)}</p>
            <p className="text-muted-foreground">{formatDate(event.createdAt)}{event.reason ? ` · ${event.reason}` : ""}</p>
          </div>) : <p className="text-sm text-muted-foreground">No status changes are recorded.</p>}
        </section>

        <section className="space-y-2">
          <h2 className="border-b pb-2 text-lg font-semibold">Documents on file</h2>
          {student.documents.length ? student.documents.map((document) => <div key={document.id} className="flex justify-between gap-3 border-b py-2 text-sm">
            <span>{document.title}</span><span className="text-muted-foreground">{document.category} · {formatDate(document.createdAt)}</span>
          </div>) : <p className="text-sm text-muted-foreground">No document metadata is recorded.</p>}
        </section>

        <p className="border-t pt-3 text-xs text-muted-foreground">Medical and financial details are not included in this printable record.</p>
      </article>
    </main>
  );
}
