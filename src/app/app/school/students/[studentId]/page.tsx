import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpenCheck,
  CreditCard,
  FileClock,
  HeartPulse,
  Home,
  IdCard,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/school/section-card";
import {
  formatDate,
  formatMoney,
  humanizeStatus,
} from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSurfaceOrigins } from "@/lib/app-surfaces";
import { SchoolNotFoundError } from "@/modules/school/service";
import {
  getSchoolDigitalIdPresentation,
  getSchoolStudentProfile,
} from "@/modules/school/student-profile-service";
import { getStudentHostelSummary } from "@/modules/school/hostel-integration";
import { issueStudentIdAction, revokeStudentIdAction } from "../../actions";

const sections = [
  ["passport", "Passport and Bio"],
  ["academic", "Academic Performance"],
  ["financial", "Financial"],
  ["attendance", "Attendance and Conduct"],
  ["hostel", "Boarding and Hostel"],
  ["history", "Documents and History"],
] as const;

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const [tenant, { studentId }, query] = await Promise.all([
    requireModuleAccess("school"),
    params,
    searchParams,
  ]);
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENT_PROFILE_VIEW))
    notFound();
  const canMedical = hasPermission(
    tenant,
    PERMISSIONS.SCHOOL_STUDENT_MEDICAL_VIEW,
  );
  const canAcademic = hasPermission(
    tenant,
    PERMISSIONS.SCHOOL_ACADEMIC_PERFORMANCE_VIEW,
  );
  const canFinance = hasPermission(
    tenant,
    PERMISSIONS.SCHOOL_STUDENT_FINANCE_VIEW,
  );
  const canAttendance = hasPermission(
    tenant,
    PERMISSIONS.SCHOOL_ATTENDANCE_VIEW,
  );
  const canConduct = hasPermission(tenant, PERMISSIONS.SCHOOL_CONDUCT_VIEW);
  const canId = hasPermission(tenant, PERMISSIONS.SCHOOL_DIGITAL_ID_MANAGE);
  const canHostel =
    tenant.enabledModuleKeys.includes("hostel") &&
    hasPermission(tenant, PERMISSIONS.HOSTEL_VIEW) &&
    hasPermission(tenant, PERMISSIONS.SCHOOL_HOSTEL_PROFILE_VIEW);
  let student;
  try {
    student = await getSchoolStudentProfile(
      tenant.organizationId,
      studentId,
      tenant.userId,
      {
        medical: canMedical,
        academic: canAcademic,
        finance: canFinance,
        attendance: canAttendance,
        conduct: canConduct,
        digitalId: canId,
      },
    );
  } catch (error) {
    if (error instanceof SchoolNotFoundError) notFound();
    throw error;
  }
  const hostel = canHostel
    ? await getStudentHostelSummary(tenant.organizationId, studentId)
    : null;
  const activeCard = student.digitalIdCards.find(
    (card) => card.status === "ACTIVE" && card.expiryDate > new Date(),
  );
  const digitalId = activeCard
    ? await getSchoolDigitalIdPresentation(
        tenant.organizationId,
        activeCard.id,
        getSurfaceOrigins().tenant,
      )
    : null;
  const money = (value: Parameters<typeof formatMoney>[0]) =>
    formatMoney(value, tenant.organization.currency);
  const available = sections.filter(([key]) => key !== "hostel" || canHostel);
  const section = available.some(([key]) => key === query.section)
    ? query.section!
    : "passport";
  const enrollment =
    student.enrollments.find((item) => item.status === "ACTIVE") ??
    student.enrollments[0];
  const term = enrollment?.academicYear.terms.find((item) => item.current);
  const guardian =
    student.guardians.find((item) => item.primary) ?? student.guardians[0];
  const attendanceTotal = student.attendance.length;
  const attended = student.attendance.filter(
    (item) => item.status === "PRESENT" || item.status === "LATE",
  ).length;
  const billed = student.feeInvoices
    .filter((item) => item.status !== "DRAFT" && item.status !== "VOID")
    .reduce(
      (sum, item) => sum + Number(item.amount) - Number(item.discount),
      0,
    );
  const paid = student.feeInvoices
    .flatMap((item) => item.payments)
    .filter((item) => !item.refundedAt)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const publishedResults = student.examResults.filter(
    (item) => item.exam.status === "PUBLISHED" && item.publishedAt,
  );
  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`Student ID ${student.admissionNumber}`}
        actions={
          <Button
            nativeButton={false}
            render={<Link href="/app/school/students" />}
            variant="outline"
          >
            Back to students
          </Button>
        }
      />
      {digitalId && canId ? (
        <div className="flex justify-end">
          <Button
            nativeButton={false}
            render={
              <Link href={`/api/school/student-id/${digitalId.card.id}/pdf`} />
            }
            size="sm"
            variant="outline"
          >
            Download wallet-size ID PDF
          </Button>
        </div>
      ) : null}
      <section className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm md:grid-cols-[auto_1fr]">
        {student.photoData ? (
          <Image
            src={`/api/school/students/${student.id}/photo`}
            alt={`${student.firstName} ${student.lastName}`}
            width={128}
            height={128}
            unoptimized
            className="size-28 rounded-2xl border object-cover"
          />
        ) : (
          <div className="grid size-28 place-items-center rounded-2xl border bg-muted">
            <UserRound
              className="size-12 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">No student photo</span>
          </div>
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold">
              {student.firstName} {student.lastName}
            </h2>
            <Badge variant="outline">{humanizeStatus(student.status)}</Badge>
            {student.boardingStatus === "BOARDING" ? (
              <Badge>Boarding</Badge>
            ) : (
              <Badge variant="secondary">Day student</Badge>
            )}
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Campus</dt>
              <dd className="font-medium">{student.campus.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Current class</dt>
              <dd className="font-medium">
                {enrollment?.class.name ?? "Not enrolled"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Academic period</dt>
              <dd className="font-medium">
                {enrollment?.academicYear.name ?? "Not set"}
                {term ? `, ${term.name}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Guardian contact</dt>
              <dd className="font-medium">
                {guardian
                  ? `${guardian.guardian.firstName} ${guardian.guardian.lastName}, ${guardian.guardian.phone}`
                  : "Not recorded"}
              </dd>
            </div>
          </dl>
          {canMedical && (student.medicalNotes || student.allergies) ? (
            <p className="mt-4 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              Medical or safety information requires attention. Open Passport
              and Bio for details.
            </p>
          ) : null}
        </div>
      </section>
      <nav
        aria-label="Student profile sections"
        className="flex gap-2 overflow-x-auto border-b pb-2"
      >
        {available.map(([key, label]) => (
          <Button
            key={key}
            nativeButton={false}
            render={
              <Link
                href={`/app/school/students/${student.id}?section=${key}`}
              />
            }
            size="sm"
            variant={section === key ? "default" : "ghost"}
          >
            {label}
          </Button>
        ))}
      </nav>
      {section === "passport" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Personal record"
            description="Identity, admission, and approved contact information."
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["Date of birth", formatDate(student.dateOfBirth)],
                ["Gender", student.gender],
                ["Nationality", student.nationality],
                ["Blood group", canMedical ? student.bloodGroup : "Restricted"],
                ["Admission date", formatDate(student.admissionDate)],
                ["Address", student.address],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value || "Not recorded"}</dd>
                </div>
              ))}
            </dl>
            {canMedical ? (
              <div className="mt-5 border-t pt-4">
                <h3 className="flex items-center gap-2 font-medium">
                  <HeartPulse className="size-4" />
                  Medical and learning support
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {[
                    student.medicalNotes,
                    student.allergies,
                    student.accessibilityNotes,
                  ]
                    .filter(Boolean)
                    .join("\n\n") || "No alerts recorded."}
                </p>
              </div>
            ) : null}
          </SectionCard>
          <SectionCard
            title="Digital student ID"
            description="Revocable identity cards expose only fields approved by school policy."
          >
            <div className="space-y-3">
              {digitalId ? (
                <div className="overflow-hidden rounded-2xl bg-blue-950 p-5 text-white shadow-lg">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-blue-200">
                        {digitalId.card.organization.name}
                      </p>
                      <h3 className="mt-5 text-xl font-semibold">
                        {student.firstName} {student.lastName}
                      </h3>
                      <p className="text-sm text-blue-100">
                        {student.admissionNumber} · {student.campus.name}
                      </p>
                      <p className="mt-3 text-xs text-blue-200">
                        Valid {formatDate(digitalId.card.issueDate)} to{" "}
                        {formatDate(digitalId.card.expiryDate)}
                      </p>
                    </div>
                    <Image
                      src={digitalId.qrDataUrl}
                      alt="Student ID verification QR code"
                      width={112}
                      height={112}
                      unoptimized
                      className="rounded-lg bg-white p-1"
                    />
                  </div>
                  <p className="mt-4 break-all text-[10px] text-blue-200">
                    {digitalId.verificationUrl}
                  </p>
                </div>
              ) : (
                <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                  No active digital ID. A photo is recommended but not required.
                </p>
              )}
              {student.digitalIdCards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">
                      Issued {formatDate(card.issueDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Expires {formatDate(card.expiryDate)} ·{" "}
                      {humanizeStatus(card.status)}
                    </p>
                  </div>
                  {canId && card.status === "ACTIVE" ? (
                    <form action={revokeStudentIdAction.bind(null, student.id)}>
                      <input type="hidden" name="cardId" value={card.id} />
                      <input
                        type="hidden"
                        name="reason"
                        value="Revoked by authorized user"
                      />
                      <Button size="sm" variant="destructive">
                        Revoke
                      </Button>
                    </form>
                  ) : null}
                </div>
              ))}
              {canId ? (
                <form action={issueStudentIdAction.bind(null, student.id)}>
                  <Button>
                    <IdCard />
                    Issue new digital ID
                  </Button>
                </form>
              ) : null}
            </div>
          </SectionCard>
        </div>
      ) : null}
      {section === "academic" ? (
        canAcademic ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <OverviewMetricCard
                label="Published results"
                value={publishedResults.length}
                description="Only results from published examinations"
                icon={<BookOpenCheck />}
              />
              <OverviewMetricCard
                label="Current subjects"
                value={
                  new Set(publishedResults.map((item) => item.subjectId)).size
                }
                description="Subjects represented in published records"
                icon={<BadgeCheck />}
              />
              <OverviewMetricCard
                label="Average"
                value={
                  publishedResults.length
                    ? `${(publishedResults.reduce((sum, item) => sum + (Number(item.marks) / Number(item.exam.totalMarks)) * 100, 0) / publishedResults.length).toFixed(1)}%`
                    : "No data"
                }
                description="Mean percentage across published results"
                icon={<CreditCard />}
              />
            </div>
            <SectionCard
              title="Published academic record"
              description="Draft and moderation-stage results are excluded."
            >
              {publishedResults.length ? (
                publishedResults.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-3 gap-3 border-b py-3 text-sm"
                  >
                    <span>{item.subject.name}</span>
                    <span>{item.exam.name}</span>
                    <span className="text-right font-medium">
                      {Number(item.marks)}/{Number(item.exam.totalMarks)}{" "}
                      {item.grade ?? ""}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No published results are available.
                </p>
              )}
            </SectionCard>
          </>
        ) : (
          <p className="rounded-lg border p-6">
            Your role cannot view academic performance.
          </p>
        )
      ) : null}
      {section === "financial" ? (
        canFinance ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <OverviewMetricCard
                label="Total billed"
                value={money(billed)}
                description="Issued charges, excluding drafts and voids"
                icon={<CreditCard />}
              />
              <OverviewMetricCard
                label="Confirmed collected"
                value={money(paid)}
                description="Non-refunded confirmed payments"
                icon={<BadgeCheck />}
              />
              <OverviewMetricCard
                label="Outstanding"
                value={money(Math.max(0, billed - paid))}
                description="Billed less confirmed collected"
                icon={<AlertTriangle />}
              />
            </div>
            <SectionCard
              title="Student invoices"
              description="Billed, collected, and outstanding remain separate."
            >
              {student.feeInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="grid grid-cols-3 gap-3 border-b py-3 text-sm"
                >
                  <span>{invoice.invoiceNumber}</span>
                  <span>{humanizeStatus(invoice.status)}</span>
                  <span className="text-right">{money(invoice.amount)}</span>
                </div>
              ))}
            </SectionCard>
          </>
        ) : (
          <p className="rounded-lg border p-6">
            Your role cannot view student financial information.
          </p>
        )
      ) : null}
      {section === "attendance" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {canAttendance ? (
            <SectionCard
              title="Attendance"
              description="Most recent 400 records in the authoritative attendance register."
            >
              <p className="text-3xl font-semibold">
                {attendanceTotal
                  ? `${Math.round((attended / attendanceTotal) * 100)}%`
                  : "No data"}
              </p>
              <p className="text-sm text-muted-foreground">
                {attended} present or late of {attendanceTotal} marked days
              </p>
            </SectionCard>
          ) : null}
          {canConduct ? (
            <SectionCard
              title="Conduct"
              description="Private details are available only to safeguarding-authorized roles."
            >
              {student.conductRecords.length ? (
                student.conductRecords.map((record) => (
                  <div key={record.id} className="border-b py-3 text-sm">
                    <div className="flex justify-between">
                      <strong>{record.category}</strong>
                      <Badge variant="outline">
                        {humanizeStatus(record.severity)}
                      </Badge>
                    </div>
                    <p className="mt-1">{record.description}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No conduct records are available.
                </p>
              )}
            </SectionCard>
          ) : null}
        </div>
      ) : null}
      {section === "hostel" && hostel ? (
        <SectionCard
          title="Boarding and Hostel"
          description="Read-only information supplied by the Hostel module."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Hostel billed</p>
              <p className="text-xl font-semibold">{money(hostel.billed)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Confirmed paid</p>
              <p className="text-xl font-semibold">{money(hostel.paid)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Outstanding</p>
              <p className="text-xl font-semibold">
                {money(hostel.outstanding)}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {hostel.allocations.length ? (
              hostel.allocations.map((allocation) => (
                <div
                  key={allocation.id}
                  className="rounded-lg border p-3 text-sm"
                >
                  <p className="font-medium">
                    {allocation.bed.room.building.name}, room{" "}
                    {allocation.bed.room.roomNumber}, bed {allocation.bed.label}
                  </p>
                  <p className="text-muted-foreground">
                    {allocation.academicYear.name} ·{" "}
                    {humanizeStatus(allocation.status)} · checked in{" "}
                    {formatDate(allocation.checkInDate)}
                  </p>
                  <p className="text-muted-foreground">
                    Warden:{" "}
                    {allocation.bed.room.building.wardens
                      .map((warden) => warden.user.name ?? warden.user.email)
                      .join(", ") || "Not assigned"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No Hostel allocation is recorded.
              </p>
            )}
          </div>
          <Button nativeButton={false} render={<Link href="/app/hostel/allocations" />} className="mt-4">
            <Home />
            Open Hostel allocations
          </Button>
        </SectionCard>
      ) : null}
      {section === "history" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Status history"
            description="Append-only student lifecycle changes."
          >
            {student.lifecycleEvents.map((event) => (
              <div key={event.id} className="border-b py-3 text-sm">
                <strong>
                  {humanizeStatus(event.fromStatus)} to{" "}
                  {humanizeStatus(event.toStatus)}
                </strong>
                <p className="text-muted-foreground">
                  {formatDate(event.createdAt)}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
              </div>
            ))}
          </SectionCard>
          <SectionCard
            title="Documents"
            description="Student document metadata. File access remains separately authorized."
          >
            {student.documents.length ? (
              student.documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center gap-3 border-b py-3 text-sm"
                >
                  <FileClock className="size-4" />
                  <span>{document.title}</span>
                  <span className="ml-auto text-muted-foreground">
                    {document.category}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No documents uploaded.
              </p>
            )}
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
