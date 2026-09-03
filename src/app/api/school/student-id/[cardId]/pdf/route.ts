import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSurfaceOrigins } from "@/lib/app-surfaces";
import { parseSchoolPhotoImage } from "@/lib/school-photo-image";
import { buildStudentIdPdf } from "@/lib/reports/student-id-pdf";
import { getSchoolDigitalIdPresentation, recordSchoolIdPrint } from "@/modules/school/student-profile-service";

export async function GET(_request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_DIGITAL_ID_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { cardId } = await params;
  const presentation = await getSchoolDigitalIdPresentation(tenant.organizationId, cardId, getSurfaceOrigins().tenant);
  if (presentation.card.status !== "ACTIVE" || presentation.card.expiryDate <= new Date()) return NextResponse.json({ error: "Card is not active" }, { status: 409 });
  const approved = presentation.card.approvedPublicData as Record<string, unknown>;
  const photo = presentation.card.student.photoData ? parseSchoolPhotoImage(presentation.card.student.photoData)?.bytes : null;
  const pdf = await buildStudentIdPdf({
    schoolName: presentation.card.organization.name,
    studentName: String(approved.studentName ?? "Student"),
    studentNumber: String(approved.studentId ?? ""),
    campus: String(approved.campus ?? ""),
    className: approved.className ? String(approved.className) : null,
    academicYear: approved.academicYear ? String(approved.academicYear) : null,
    status: String(approved.enrollmentStatus ?? ""),
    issueDate: presentation.card.issueDate,
    expiryDate: presentation.card.expiryDate,
    photo,
    qrDataUrl: presentation.qrDataUrl,
    verificationUrl: presentation.verificationUrl,
  });
  await recordSchoolIdPrint(tenant.organizationId, cardId, tenant.userId);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="student-id-${String(approved.studentId ?? cardId)}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
