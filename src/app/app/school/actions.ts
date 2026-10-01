"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import { cuid, shortText, longText, dateInput, moneyAmountPositive, parseWithSchema } from "@/lib/validation";
import { createSchoolCampus, createSchoolAcademicYear, closeSchoolAcademicYear, deleteSchoolAcademicYear, createSchoolTerm, admitSchoolStudent, createSchoolGuardian, updateSchoolGuardian, linkSchoolGuardian, updateSchoolStudentGuardianLinks, createSchoolClass, updateSchoolClassCapacity, assignSchoolClassTeacher, removeSchoolClassTeacher, createSchoolSubject, enrollSchoolStudent, transferSchoolEnrollment, rollOverSchoolEnrollments, recordSchoolAttendanceBulk, publishSchoolAttendanceRegister, createSchoolFeeInvoice, recordSchoolFeePayment, getSchoolFeePaymentForPostingRetry, recordSchoolFeeRefund, getSchoolFeeRefundForPostingRetry, createSchoolTimetableEntry, createSchoolExam, recordSchoolExamResult, submitSchoolExamForModeration, publishSchoolExam, createSchoolLibraryBook, borrowSchoolLibraryBook, returnSchoolLibraryBook, createSchoolTransportRoute, assignSchoolTransport, createSchoolPayrollAdjustment, assignPendingSchoolPayrollEmployee, upsertSchoolSettings, transitionSchoolStudent, updateSchoolStudentProfile, createSchoolFeeStructure, issueSchoolFeeStructure, updateSchoolStudentPhoto, updateSchoolGuardianPhoto, SchoolStateError, SchoolNotFoundError } from "@/modules/school/service";
import { schoolPhotoImageData, schoolStudentPhotoImages } from "@/lib/school-photo-image";
import { postSchoolFeePaymentRevenue } from "@/modules/school/accounting";
import { postSchoolFeeRefundRevenue } from "@/modules/school/accounting";
import { getSurfaceOrigins } from "@/lib/app-surfaces";
import { createSchoolConductRecord, issueSchoolDigitalId, revokeSchoolDigitalId, recordSchoolIdPrint } from "@/modules/school/student-profile-service";

const clean=(value:FormDataEntryValue|null)=>{const text=String(value??"").trim();return text||null};
async function auth(permission:string,path:string){const tenant=await requireModuleAccess("school");if(!hasPermission(tenant,permission))redirect(`${path}?error=forbidden`);return tenant;}
const fail=(path:string,error:unknown):never=>{if(error instanceof SchoolStateError)redirect(`${path}?error=state-${error.code}`);if(error instanceof SchoolNotFoundError)redirect(`${path}?error=not-found`);throw error;};

export async function createCampusAction(f:FormData){const path="/app/school/campuses",t=await auth(PERMISSIONS.SCHOOL_CAMPUSES_MANAGE,path);const p=z.object({code:shortText,name:shortText,address:longText.nullable(),phone:shortText.nullable(),email:z.string().email().nullable()}).safeParse({code:clean(f.get("code")),name:clean(f.get("name")),address:clean(f.get("address")),phone:clean(f.get("phone")),email:clean(f.get("email"))});if(!p.success)redirect(`${path}?error=invalid`);await createSchoolCampus(t.organizationId,p.data);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function createAcademicYearAction(f:FormData){const path="/app/school/academic-periods",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=parseWithSchema(z.object({name:shortText,startDate:dateInput,endDate:dateInput,current:z.boolean()}),{name:clean(f.get("name"))??"",startDate:clean(f.get("startDate")),endDate:clean(f.get("endDate")),current:f.get("current")==="on"});if(!p.success)redirect(`${path}?error=invalid`);try{await createSchoolAcademicYear(t.organizationId,p.data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function archiveAcademicYearAction(f:FormData){const path="/app/school/academic-periods",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const id=clean(f.get("academicYearId"));if(!id)redirect(`${path}?error=invalid`);try{await closeSchoolAcademicYear(t.organizationId,id)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
/**
 * Hard-deleting an academic year is destructive and admin-only: gated on
 * the organization-admin permission (not just SCHOOL_ACADEMICS_MANAGE) and
 * a re-entered account password, matching the pattern already used for
 * other irreversible actions (see src/app/app/platform/organizations/actions.ts).
 * deleteSchoolAcademicYear itself still refuses to run if the year has any
 * terms, enrollments, fees, or exams attached.
 */
export async function deleteAcademicYearAction(f:FormData){
  const path="/app/school/academic-periods";
  const tenant=await requireModuleAccess("school");
  if(!hasPermission(tenant,PERMISSIONS.ORG_SETTINGS_MANAGE))redirect(`${path}?error=forbidden`);
  const id=clean(f.get("academicYearId"));
  const password=String(f.get("confirmPassword")??"");
  if(!id||!password)redirect(`${path}?error=invalid`);
  if(!(await verifyCurrentPassword(tenant.userId,password)))redirect(`${path}?error=wrong-password`);
  try{await deleteSchoolAcademicYear(tenant.organizationId,id)}catch(e){fail(path,e)}
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}
export async function createTermAction(f:FormData){const path="/app/school/academic-periods",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=parseWithSchema(z.object({academicYearId:cuid,name:shortText,startDate:dateInput,endDate:dateInput,current:z.boolean()}),{academicYearId:clean(f.get("academicYearId"))??"",name:clean(f.get("name"))??"",startDate:clean(f.get("startDate")),endDate:clean(f.get("endDate")),current:f.get("current")==="on"});if(!p.success)redirect(`${path}?error=invalid`);try{await createSchoolTerm(t.organizationId,p.data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function createStudentAction(f:FormData){
  const path="/app/school/students",t=await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE,path);
  const p=parseWithSchema(z.object({campusId:cuid,firstName:shortText,lastName:shortText,dateOfBirth:dateInput.nullable(),gender:shortText.nullable(),admissionDate:dateInput.nullable(),medicalNotes:longText.nullable()}),{campusId:clean(f.get("campusId"))??"",firstName:clean(f.get("firstName"))??"",lastName:clean(f.get("lastName"))??"",dateOfBirth:clean(f.get("dateOfBirth")),gender:clean(f.get("gender")),admissionDate:clean(f.get("admissionDate")),medicalNotes:clean(f.get("medicalNotes"))});
  if(!p.success)redirect(`${path}?error=invalid`);

  const existingGuardianId = clean(f.get("existingGuardianId"));
  const guardianMode = clean(f.get("guardianMode"));
  const guardianFirstName = clean(f.get("guardianFirstName"));
  const guardianLastName = clean(f.get("guardianLastName"));
  const guardianPhone = clean(f.get("guardianPhone"));
  const guardianRelationship = clean(f.get("guardianRelationship"));
  let guardianData: Parameters<typeof admitSchoolStudent>[2] = null;
  if (guardianMode === "existing" && existingGuardianId) {
    if (!guardianRelationship) redirect(`${path}?error=invalid`);
    guardianData = { guardianId: existingGuardianId, relationship: guardianRelationship };
  } else if (guardianMode === "new") {
    const gp = z.object({
      firstName: shortText,
      lastName: shortText,
      phone: shortText,
      relationship: shortText,
      email: z.string().email().nullable(),
      occupation: shortText.nullable(),
      address: longText.nullable(),
    }).safeParse({
      firstName: guardianFirstName,
      lastName: guardianLastName,
      phone: guardianPhone,
      relationship: guardianRelationship,
      email: clean(f.get("guardianEmail")),
      occupation: clean(f.get("guardianOccupation")),
      address: clean(f.get("guardianAddress")),
    });
    if (!gp.success) redirect(`${path}?error=invalid`);
    guardianData = gp.data;
  } else {
    redirect(`${path}?error=invalid`);
  }

  try{await admitSchoolStudent(t.organizationId,p.data,guardianData)}catch(e){fail(path,e)}
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}
export async function createGuardianAction(f:FormData){const path="/app/school/students",t=await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE,path);const p=z.object({firstName:shortText,lastName:shortText,email:z.string().email().nullable(),phone:shortText,address:longText.nullable(),occupation:shortText.nullable()}).safeParse({firstName:clean(f.get("firstName")),lastName:clean(f.get("lastName")),email:clean(f.get("email")),phone:clean(f.get("phone")),address:clean(f.get("address")),occupation:clean(f.get("occupation"))});if(!p.success)redirect(`${path}?error=invalid`);await createSchoolGuardian(t.organizationId,p.data);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function updateGuardianAction(f:FormData){const path="/app/school/students",t=await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE,path);const p=z.object({guardianId:cuid,firstName:shortText,lastName:shortText,email:z.string().email().nullable(),phone:shortText,address:longText.nullable(),occupation:shortText.nullable()}).safeParse({guardianId:clean(f.get("guardianId")),firstName:clean(f.get("firstName")),lastName:clean(f.get("lastName")),email:clean(f.get("email")),phone:clean(f.get("phone")),address:clean(f.get("address")),occupation:clean(f.get("occupation"))});if(!p.success)redirect(`${path}?error=invalid`);const{guardianId,...data}=p.data;try{await updateSchoolGuardian(t.organizationId,guardianId,data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=guardian`)}
export async function linkGuardianAction(f:FormData){const path="/app/school/students",t=await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE,path);const p=z.object({studentId:cuid,guardianId:cuid,relationship:shortText,primary:z.boolean()}).safeParse({studentId:clean(f.get("studentId")),guardianId:clean(f.get("guardianId")),relationship:clean(f.get("relationship")),primary:f.get("primary")==="on"});if(!p.success)redirect(`${path}?error=invalid`);try{await linkSchoolGuardian(t.organizationId,p.data.studentId,p.data.guardianId,p.data.relationship,p.data.primary)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function manageStudentGuardiansAction(f: FormData) {
  const path = "/app/school/students";
  const t = await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE, path);
  const studentId = cuid.safeParse(clean(f.get("studentId")));
  const guardianIds = f.getAll("linkedGuardianId").map((value) => typeof value === "string" ? value : "");
  const primaryChoice = clean(f.get("primaryGuardianId"));
  const newGuardianId = clean(f.get("newGuardianId"));
  const newRelationship = clean(f.get("newRelationship"));
  const pickupIds = new Set(f.getAll("pickupGuardianId").filter((value): value is string => typeof value === "string"));
  const removeIds = new Set(f.getAll("removeGuardianId").filter((value): value is string => typeof value === "string"));
  if (!studentId.success || guardianIds.length > 50 || (newGuardianId && !cuid.safeParse(newGuardianId).success)) redirect(`${path}?error=invalid`);
  const links = guardianIds.map((guardianId) => {
    const id = cuid.safeParse(guardianId);
    const relationship = shortText.safeParse(clean(f.get(`relationship_${guardianId}`)));
    if (!id.success || !relationship.success) return null;
    return { guardianId, relationship: relationship.data, authorizedPickup: pickupIds.has(guardianId), remove: removeIds.has(guardianId) };
  });
  if (links.some((link) => link === null)) redirect(`${path}?error=invalid`);
  const validLinks = links.filter((link): link is NonNullable<typeof link> => link !== null);
  let add: { guardianId: string; relationship: string; authorizedPickup: boolean } | undefined;
  if (newGuardianId) {
    const parsedGuardian = cuid.safeParse(newGuardianId);
    const parsedRelationship = shortText.safeParse(newRelationship);
    if (!parsedGuardian.success || !parsedRelationship.success) redirect(`${path}?error=invalid`);
    add = { guardianId: parsedGuardian.data, relationship: parsedRelationship.data, authorizedPickup: f.get("newAuthorizedPickup") === "on" };
  }
  const primaryGuardianId = primaryChoice === "new" ? add?.guardianId : primaryChoice || undefined;
  try {
    await updateSchoolStudentGuardianLinks(t.organizationId, studentId.data, {
      links: validLinks,
      add,
      primaryGuardianId,
    }, t.userId);
  } catch (error) { fail(path, error); }
  revalidatePath(path);
  revalidatePath(`/app/school/students/${studentId.data}`);
  const params = new URLSearchParams();
  const query = clean(f.get("q"));
  const status = clean(f.get("status"));
  const page = clean(f.get("page"));
  if (query) params.set("q", query.slice(0, 500));
  if (["APPLICANT", "ACTIVE", "SUSPENDED", "WITHDRAWN", "GRADUATED"].includes(status ?? "")) params.set("status", status!);
  if (page && /^\d{1,6}$/.test(page)) params.set("page", page);
  params.set("saved", "family");
  redirect(`${path}?${params.toString()}`);
}
export async function createClassAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({campusId:cuid,code:shortText,name:shortText,gradeLevel:shortText.nullable(),capacity:z.coerce.number().int().positive().max(10000).nullable()}).safeParse({campusId:clean(f.get("campusId")),code:clean(f.get("code")),name:clean(f.get("name")),gradeLevel:clean(f.get("gradeLevel")),capacity:clean(f.get("capacity"))?clean(f.get("capacity")):null});if(!p.success)redirect(`${path}?error=invalid`);await createSchoolClass(t.organizationId,p.data);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function updateClassCapacityAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({classId:cuid,capacity:z.coerce.number().int().positive().max(10000).nullable()}).safeParse({classId:clean(f.get("classId")),capacity:clean(f.get("capacity"))?clean(f.get("capacity")):null});if(!p.success)redirect(`${path}?error=invalid`);try{await updateSchoolClassCapacity(t.organizationId,p.data.classId,p.data.capacity)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function assignClassTeacherAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({classId:cuid,userId:cuid}).safeParse({classId:clean(f.get("classId")),userId:clean(f.get("userId"))});if(!p.success)redirect(`${path}?error=invalid`);try{await assignSchoolClassTeacher(t.organizationId,p.data.classId,p.data.userId)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function removeClassTeacherAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({classId:cuid,userId:cuid}).safeParse({classId:clean(f.get("classId")),userId:clean(f.get("userId"))});if(!p.success)redirect(`${path}?error=invalid`);await removeSchoolClassTeacher(t.organizationId,p.data.classId,p.data.userId);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function createSubjectAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({code:shortText,name:shortText,description:longText.nullable()}).safeParse({code:clean(f.get("code")),name:clean(f.get("name")),description:clean(f.get("description"))});if(!p.success)redirect(`${path}?error=invalid`);await createSchoolSubject(t.organizationId,p.data);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function enrollStudentAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE,path);const p=z.object({campusId:cuid,academicYearId:cuid,studentId:cuid,classId:cuid}).safeParse(Object.fromEntries(["campusId","academicYearId","studentId","classId"].map(k=>[k,clean(f.get(k))])));if(!p.success)redirect(`${path}?error=invalid`);try{await enrollSchoolStudent(t.organizationId,p.data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function transferStudentEnrollmentAction(f: FormData) {
  const studentId = clean(f.get("studentId"));
  const parsedStudentId = cuid.safeParse(studentId);
  const path = parsedStudentId.success ? `/app/school/students/${parsedStudentId.data}` : "/app/school/students";
  const t = await auth(PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE, path);
  const p = z.object({ studentId: cuid, enrollmentId: cuid, academicYearId: cuid, expectedClassId: cuid, targetClassId: cuid, reason: z.string().trim().min(5).max(500) }).safeParse({ studentId, enrollmentId: clean(f.get("enrollmentId")), academicYearId: clean(f.get("academicYearId")), expectedClassId: clean(f.get("expectedClassId")), targetClassId: clean(f.get("targetClassId")), reason: clean(f.get("reason")) ?? "" });
  if (!p.success) redirect(`${path}?error=invalid`);
  try { await transferSchoolEnrollment(t.organizationId, t.userId, p.data); } catch (e) { fail(path, e); }
  revalidatePath(path); revalidatePath("/app/school/students"); revalidatePath("/app/school/classes");
  redirect(`${path}?section=history&saved=transfer`);
}
export async function rollOverEnrollmentsAction(f: FormData) {
  const path = "/app/school/rollover";
  const tenant = await auth(PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE, path);
  const sourceYearId = cuid.safeParse(clean(f.get("sourceYearId")));
  const targetYearId = cuid.safeParse(clean(f.get("targetYearId")));
  const mappingEntries = [...f.entries()].filter(([key, value]) => key.startsWith("classMap_") && typeof value === "string");
  const countEntries = [...f.entries()].filter(([key, value]) => key.startsWith("classCount_") && typeof value === "string");
  if (!sourceYearId.success || !targetYearId.success || mappingEntries.length > 250 || countEntries.length !== mappingEntries.length) redirect(`${path}?error=invalid`);
  const classMapping: Record<string, string> = {};
  const expectedLearnersByClass: Record<string, number> = {};
  for (const [key, value] of mappingEntries) {
    const sourceClassId = cuid.safeParse(key.slice("classMap_".length));
    const targetClassId = cuid.safeParse(value);
    if (!sourceClassId.success || !targetClassId.success) redirect(`${path}?error=invalid`);
    classMapping[sourceClassId.data] = targetClassId.data;
  }
  for (const [key, value] of countEntries) {
    const sourceClassId = cuid.safeParse(key.slice("classCount_".length));
    const count = z.coerce.number().int().positive().max(5000).safeParse(value);
    if (!sourceClassId.success || !count.success) redirect(`${path}?error=invalid`);
    expectedLearnersByClass[sourceClassId.data] = count.data;
  }
  if (Object.keys(classMapping).length !== Object.keys(expectedLearnersByClass).length) redirect(`${path}?error=invalid`);
  try {
    await rollOverSchoolEnrollments(tenant.organizationId, sourceYearId.data, targetYearId.data, classMapping, expectedLearnersByClass, tenant.userId);
  } catch (error) {
    fail(path, error);
  }
  for (const route of [path, "/app/school/classes", "/app/school/academic-periods"]) revalidatePath(route);
  redirect(`${path}?saved=1`);
}
/**
 * Records attendance for every student in a class on one date from a single
 * roster form submission, instead of one dialog round trip per student. The
 * roster's active student ids aren't known ahead of time, so entries are
 * pulled directly off the submitted FormData keys (status_<studentId> /
 * reason_<studentId>) rather than a fixed zod shape - recordSchoolAttendanceBulk
 * re-derives the authoritative active roster server-side and drops anything
 * that doesn't match, so a tampered or stale studentId can't write a record
 * for a student who isn't actually enrolled in this class.
 */
export async function recordAttendanceBulkAction(f: FormData) {
  const path = "/app/school/attendance";
  const t = await auth(PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE, path);
  const head = parseWithSchema(
    z.object({ termId: cuid, classId: cuid, date: dateInput }),
    { termId: clean(f.get("termId")) ?? "", classId: clean(f.get("classId")) ?? "", date: clean(f.get("date")) },
  );
  if (!head.success) redirect(`${path}?error=invalid`);

  const statusSchema = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
  const entries: Array<{ studentId: string; status: z.infer<typeof statusSchema>; reason: string | null; correctionReason: string | null }> = [];
  for (const [key, value] of f.entries()) {
    const match = /^status_(.+)$/.exec(key);
    if (!match) continue;
    const status = statusSchema.safeParse(value);
    if (!status.success) continue;
    const studentId = match[1];
    entries.push({ studentId, status: status.data, reason: clean(f.get(`reason_${studentId}`)), correctionReason: clean(f.get(`correction_${studentId}`)) });
  }
  if (entries.length === 0) redirect(`${path}?error=invalid`);

  try {
    const result = await recordSchoolAttendanceBulk(t.organizationId, t.userId, { ...head.data, entries });
    revalidatePath(path);
    const params = new URLSearchParams({ saved: "1", count: String(result.saved), termId: head.data.termId, classId: head.data.classId, date: clean(f.get("date")) ?? "" });
    if (result.skipped > 0) params.set("skipped", String(result.skipped));
    redirect(`${path}?${params.toString()}`);
  } catch (e) {
    fail(path, e);
  }
}
export async function publishAttendanceRegisterAction(f: FormData) {
  const path = "/app/school/attendance";
  const t = await auth(PERMISSIONS.SCHOOL_ATTENDANCE_PUBLISH, path);
  const p = parseWithSchema(z.object({ termId: cuid, classId: cuid, date: dateInput }), { termId: clean(f.get("termId")) ?? "", classId: clean(f.get("classId")) ?? "", date: clean(f.get("date")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  try {
    await publishSchoolAttendanceRegister(t.organizationId, p.data.termId, p.data.classId, p.data.date);
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  const params = new URLSearchParams({ saved: "1", published: "1", termId: p.data.termId, classId: p.data.classId, date: clean(f.get("date")) ?? "" });
  redirect(`${path}?${params.toString()}`);
}
export async function createFeeInvoiceAction(f:FormData){const path="/app/school/fees",t=await auth(PERMISSIONS.SCHOOL_FEES_MANAGE,path);const p=parseWithSchema(z.object({academicYearId:cuid,termId:cuid.nullable(),studentId:cuid,description:shortText,amount:moneyAmountPositive,discount:z.coerce.number().min(0),dueDate:dateInput.nullable()}),{academicYearId:clean(f.get("academicYearId"))??"",termId:clean(f.get("termId")),studentId:clean(f.get("studentId"))??"",description:clean(f.get("description"))??"",amount:clean(f.get("amount")),discount:clean(f.get("discount"))??"0",dueDate:clean(f.get("dueDate"))});if(!p.success)redirect(`${path}?error=invalid`);try{await createSchoolFeeInvoice(t.organizationId,p.data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function recordFeePaymentAction(f: FormData) {
  const path = "/app/school/fees", t = await auth(PERMISSIONS.SCHOOL_FEES_MANAGE, path);
  const p = parseWithSchema(z.object({ invoiceId: cuid, amount: moneyAmountPositive, method: z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "ONLINE", "OTHER"]), reference: shortText.nullable() }), { invoiceId: clean(f.get("invoiceId")) ?? "", amount: clean(f.get("amount")), method: clean(f.get("method")), reference: clean(f.get("reference")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  const { invoiceId, ...data } = p.data;
  let postingFailed = false;
  try {
    const payment = await recordSchoolFeePayment(t.organizationId, invoiceId, data);
    try {
      const result = await postSchoolFeePaymentRevenue(t.organizationId, payment, t.userId);
      postingFailed = !result.posted && result.reason === "error";
    } catch (error) {
      postingFailed = true;
      console.error("[school:fee-accounting-posting] status update failed", { organizationId: t.organizationId, paymentId: payment.id, error });
    }
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  redirect(`${path}?saved=1${postingFailed ? "&posting=failed" : ""}`);
}

export async function retrySchoolFeePostingAction(f: FormData) {
  const path = "/app/school/fees", t = await auth(PERMISSIONS.SCHOOL_FEES_MANAGE, path);
  const id = cuid.safeParse(clean(f.get("paymentId")));
  if (!id.success) redirect(`${path}?error=invalid`);
  const payment = await getSchoolFeePaymentForPostingRetry(t.organizationId, id.data);
  if (!payment) redirect(`${path}?error=posting-not-retryable`);
  let failed = false;
  try {
    const result = await postSchoolFeePaymentRevenue(t.organizationId, payment, t.userId);
    failed = !result.posted && result.reason === "error";
  } catch (error) {
    failed = true;
    console.error("[school:fee-accounting-retry] failed", { organizationId: t.organizationId, paymentId: payment.id, actorId: t.userId, error });
  }
  revalidatePath(path);
  redirect(`${path}?posting=${failed ? "failed" : "complete"}`);
}

export async function recordSchoolFeeRefundAction(f: FormData) {
  const path = "/app/school/fees", t = await auth(PERMISSIONS.SCHOOL_FEES_MANAGE, path);
  const parsed = parseWithSchema(z.object({ paymentId: cuid, amount: moneyAmountPositive, method: z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "ONLINE", "OTHER"]), reason: z.string().trim().min(3).max(1000), reference: shortText.nullable() }), {
    paymentId: clean(f.get("paymentId")) ?? "", amount: clean(f.get("amount")), method: clean(f.get("method")), reason: clean(f.get("reason")) ?? "", reference: clean(f.get("reference")),
  });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  let postingFailed = false;
  try {
    const refund = await recordSchoolFeeRefund(t.organizationId, parsed.data.paymentId, t.userId, { amount: parsed.data.amount, method: parsed.data.method, reason: parsed.data.reason, reference: parsed.data.reference });
    try {
      const result = await postSchoolFeeRefundRevenue(t.organizationId, refund, t.userId);
      postingFailed = !result.posted && result.reason === "error";
    } catch (error) {
      postingFailed = true;
      console.error("[school:fee-refund-accounting-posting] failed", { organizationId: t.organizationId, refundId: refund.id, actorId: t.userId, error });
    }
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  revalidatePath("/app/school");
  redirect(`${path}?saved=1${postingFailed ? "&posting=failed" : ""}`);
}

export async function retrySchoolFeeRefundPostingAction(f: FormData) {
  const path = "/app/school/fees", t = await auth(PERMISSIONS.SCHOOL_FEES_MANAGE, path);
  const id = cuid.safeParse(clean(f.get("refundId")));
  if (!id.success) redirect(`${path}?error=invalid`);
  const refund = await getSchoolFeeRefundForPostingRetry(t.organizationId, id.data);
  if (!refund) redirect(`${path}?error=refund-posting-not-retryable`);
  let failed = false;
  try {
    const result = await postSchoolFeeRefundRevenue(t.organizationId, refund, t.userId);
    failed = !result.posted && result.reason === "error";
  } catch (error) {
    failed = true;
    console.error("[school:fee-refund-accounting-retry] failed", { organizationId: t.organizationId, refundId: refund.id, actorId: t.userId, error });
  }
  revalidatePath(path);
  redirect(`${path}?posting=${failed ? "failed" : "complete"}`);
}

export async function createTimetableAction(f:FormData){const path="/app/school/timetables",t=await auth(PERMISSIONS.SCHOOL_TIMETABLES_MANAGE,path);const p=z.object({campusId:cuid,termId:cuid,classId:cuid,subjectId:cuid,teacherName:shortText,room:shortText.nullable(),dayOfWeek:z.coerce.number().int().min(1).max(7),startsAt:shortText,endsAt:shortText}).safeParse(Object.fromEntries(["campusId","termId","classId","subjectId","teacherName","room","dayOfWeek","startsAt","endsAt"].map(k=>[k,clean(f.get(k))])));if(!p.success)redirect(`${path}?error=invalid`);try{await createSchoolTimetableEntry(t.organizationId,p.data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function createExamAction(f:FormData){const path="/app/school/exams",t=await auth(PERMISSIONS.SCHOOL_EXAMS_MANAGE,path);const p=parseWithSchema(z.object({academicYearId:cuid,termId:cuid,subjectId:cuid,name:shortText,totalMarks:moneyAmountPositive,weight:moneyAmountPositive,examDate:dateInput.nullable()}),{academicYearId:clean(f.get("academicYearId"))??"",termId:clean(f.get("termId"))??"",subjectId:clean(f.get("subjectId"))??"",name:clean(f.get("name"))??"",totalMarks:clean(f.get("totalMarks")),weight:clean(f.get("weight")),examDate:clean(f.get("examDate"))});if(!p.success)redirect(`${path}?error=invalid`);try{await createSchoolExam(t.organizationId,p.data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function recordExamResultAction(f:FormData){const path="/app/school/exams",t=await auth(PERMISSIONS.SCHOOL_EXAMS_MANAGE,path);const p=z.object({examId:cuid,studentId:cuid,classId:cuid,subjectId:cuid,marks:z.coerce.number().min(0),grade:shortText.nullable(),remark:shortText.nullable()}).safeParse(Object.fromEntries(["examId","studentId","classId","subjectId","marks","grade","remark"].map(k=>[k,clean(f.get(k))])));if(!p.success)redirect(`${path}?error=invalid`);try{await recordSchoolExamResult(t.organizationId,t.userId,p.data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function submitExamForModerationAction(f:FormData){const path="/app/school/exams",t=await auth(PERMISSIONS.SCHOOL_EXAMS_MANAGE,path);const id=clean(f.get("examId"));if(!id)redirect(`${path}?error=invalid`);try{await submitSchoolExamForModeration(t.organizationId,id)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function publishExamAction(f:FormData){const path="/app/school/exams",t=await auth(PERMISSIONS.SCHOOL_EXAMS_PUBLISH,path);const id=clean(f.get("examId"));if(!id)redirect(`${path}?error=invalid`);try{await publishSchoolExam(t.organizationId,id)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function createLibraryBookAction(f:FormData){const path="/app/school/library",t=await auth(PERMISSIONS.SCHOOL_LIBRARY_MANAGE,path);const p=z.object({accessionCode:shortText,isbn:shortText.nullable(),title:shortText,author:shortText.nullable(),category:shortText.nullable(),totalCopies:z.coerce.number().int().min(1).max(10000)}).safeParse(Object.fromEntries(["accessionCode","isbn","title","author","category","totalCopies"].map(k=>[k,clean(f.get(k))])));if(!p.success)redirect(`${path}?error=invalid`);await createSchoolLibraryBook(t.organizationId,p.data);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function borrowBookAction(f:FormData){const path="/app/school/library",t=await auth(PERMISSIONS.SCHOOL_LIBRARY_MANAGE,path);const p=parseWithSchema(z.object({bookId:cuid,studentId:cuid,dueAt:dateInput}),{bookId:clean(f.get("bookId"))??"",studentId:clean(f.get("studentId"))??"",dueAt:clean(f.get("dueAt"))});if(!p.success)redirect(`${path}?error=invalid`);try{await borrowSchoolLibraryBook(t.organizationId,p.data.bookId,p.data.studentId,p.data.dueAt)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function returnBookAction(f:FormData){const path="/app/school/library",t=await auth(PERMISSIONS.SCHOOL_LIBRARY_MANAGE,path);const id=clean(f.get("loanId"));if(!id)redirect(`${path}?error=invalid`);try{await returnSchoolLibraryBook(t.organizationId,id)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function createTransportRouteAction(f:FormData){const path="/app/school/transport",t=await auth(PERMISSIONS.SCHOOL_TRANSPORT_MANAGE,path);const p=z.object({campusId:cuid,code:shortText,name:shortText,vehicle:shortText.nullable(),driverName:shortText.nullable(),stops:shortText.nullable(),fee:z.coerce.number().min(0)}).safeParse(Object.fromEntries(["campusId","code","name","vehicle","driverName","stops","fee"].map(k=>[k,clean(f.get(k))])));if(!p.success)redirect(`${path}?error=invalid`);const{stops,...data}=p.data;try{await createSchoolTransportRoute(t.organizationId,{...data,stops:stops?.split(",").map(s=>s.trim()).filter(Boolean)})}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function assignTransportAction(f:FormData){const path="/app/school/transport",t=await auth(PERMISSIONS.SCHOOL_TRANSPORT_MANAGE,path);const p=z.object({routeId:cuid,studentId:cuid,stopName:shortText.nullable()}).safeParse({routeId:clean(f.get("routeId")),studentId:clean(f.get("studentId")),stopName:clean(f.get("stopName"))});if(!p.success)redirect(`${path}?error=invalid`);try{await assignSchoolTransport(t.organizationId,p.data.routeId,p.data.studentId,p.data.stopName)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function createPayrollAdjustmentAction(f: FormData) {
  const path = "/app/school/payroll";
  const tenant = await auth(PERMISSIONS.SCHOOL_PAYROLL_MANAGE, path);
  const parsed = parseWithSchema(z.object({
    employeeId: cuid,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    type: shortText,
    category: z.enum(["EARNING", "DEDUCTION"]),
    description: shortText,
    amount: moneyAmountPositive,
  }), Object.fromEntries(["employeeId", "period", "type", "category", "description", "amount"].map((key) => [key, clean(f.get(key)) ?? ""])));
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try {
    await createSchoolPayrollAdjustment(tenant.organizationId, parsed.data);
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

export async function assignPayrollInputEmployeeAction(f: FormData) {
  const path = "/app/school/payroll";
  const tenant = await auth(PERMISSIONS.SCHOOL_PAYROLL_MANAGE, path);
  const parsed = z.object({ adjustmentId: cuid, employeeId: cuid }).safeParse({
    adjustmentId: clean(f.get("adjustmentId")),
    employeeId: clean(f.get("employeeId")),
  });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try {
    await assignPendingSchoolPayrollEmployee(tenant.organizationId, parsed.data.adjustmentId, parsed.data.employeeId);
  } catch (error) {
    fail(path, error);
  }
  revalidatePath(path);
  revalidatePath("/app/payroll/runs");
  redirect(`${path}?linked=1`);
}
export async function upsertSchoolSettingsAction(f:FormData){const path="/app/school/settings",t=await auth(PERMISSIONS.SCHOOL_SETTINGS_MANAGE,path);const p=z.object({campusId:cuid,attendanceCloseDays:z.coerce.number().int().min(0).max(365),receiptPrefix:shortText,allowRanking:z.boolean(),smsNotificationsEnabled:z.boolean(),gradingScaleText:longText.nullable()}).safeParse({campusId:clean(f.get("campusId")),attendanceCloseDays:clean(f.get("attendanceCloseDays")),receiptPrefix:clean(f.get("receiptPrefix")),allowRanking:f.get("allowRanking")==="on",smsNotificationsEnabled:f.get("smsNotificationsEnabled")==="on",gradingScaleText:clean(f.get("gradingScaleText"))});if(!p.success)redirect(`${path}?error=invalid`);let gradingScale;try{gradingScale=p.data.gradingScaleText?JSON.parse(p.data.gradingScaleText):undefined}catch{redirect(`${path}?error=invalid`)}await upsertSchoolSettings(t.organizationId,{campusId:p.data.campusId,attendanceCloseDays:p.data.attendanceCloseDays,receiptPrefix:p.data.receiptPrefix,allowRanking:p.data.allowRanking,smsNotificationsEnabled:p.data.smsNotificationsEnabled,gradingScale});revalidatePath(path);redirect(`${path}?saved=1`)}

export async function transitionStudentAction(f: FormData) {
  const path = "/app/school/students";
  const tenant = await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE, path);
  const parsed = z.object({
    studentId: cuid,
    toStatus: z.enum(["APPLICANT", "ACTIVE", "SUSPENDED", "WITHDRAWN", "GRADUATED"]),
    reason: longText.nullable(),
  }).safeParse({
    studentId: clean(f.get("studentId")),
    toStatus: clean(f.get("toStatus")),
    reason: clean(f.get("reason")),
  });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await transitionSchoolStudent(tenant.organizationId, parsed.data.studentId, parsed.data.toStatus, parsed.data.reason); }
  catch (error) { fail(path, error); }
  revalidatePath(path);
  revalidatePath("/app/school/classes");
  redirect(`${path}?saved=1`);
}

export async function updateStudentProfileAction(f: FormData) {
  const path = "/app/school/students";
  const tenant = await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE, path);
  const parsed = z.object({
    studentId: cuid,
    updatedAt: z.string().datetime().transform((value) => new Date(value)),
    firstName: shortText,
    lastName: shortText,
    dateOfBirth: dateInput.nullable(),
    gender: shortText.nullable(),
    admissionDate: dateInput.nullable(),
  }).safeParse({
    studentId: clean(f.get("studentId")),
    updatedAt: clean(f.get("updatedAt")),
    firstName: clean(f.get("firstName")),
    lastName: clean(f.get("lastName")),
    dateOfBirth: clean(f.get("dateOfBirth")),
    gender: clean(f.get("gender")),
    admissionDate: clean(f.get("admissionDate")),
  });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  const { studentId, updatedAt, ...data } = parsed.data;
  try { await updateSchoolStudentProfile(tenant.organizationId, studentId, updatedAt, data); }
  catch (error) { fail(path, error); }
  revalidatePath(path);
  revalidatePath(`/app/school/students/${studentId}`);

  const params = new URLSearchParams();
  const query = clean(f.get("q"));
  const status = clean(f.get("status"));
  const page = clean(f.get("page"));
  if (query) params.set("q", query.slice(0, 500));
  if (["APPLICANT", "ACTIVE", "SUSPENDED", "WITHDRAWN", "GRADUATED"].includes(status ?? "")) params.set("status", status!);
  if (page && /^\d{1,6}$/.test(page)) params.set("page", page);
  params.set("saved", "1");
  redirect(`${path}?${params.toString()}`);
}

/**
 * A student or guardian photo is uploaded through its own small dialog
 * rather than folded into the admission/guardian creation forms - it
 * covers both "add a photo when creating" and "replace it later" with one
 * action, and keeps the (already dense) admission form from growing a
 * file input for a field most admissions won't fill in on day one.
 */
export async function updateStudentPhotoAction(f: FormData) {
  const path = "/app/school/students";
  const t = await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE, path);
  const studentId = clean(f.get("studentId"));
  if (!studentId) redirect(`${path}?error=invalid`);
  const removePhoto = f.get("removePhoto") === "on";
  const photoFile = f.get("photo");
  const cropFocus = z.enum(["attention", "centre", "north", "south"]).catch("attention").parse(clean(f.get("photoCropFocus")));
  let photoData: string | null | undefined;
  let photoOriginalData: string | null | undefined;
  try {
    const images = photoFile instanceof File ? await schoolStudentPhotoImages(photoFile, cropFocus) : null;
    photoData = images?.optimized;
    photoOriginalData = images?.original;
  } catch {
    redirect(`${path}?error=invalid`);
  }
  if (removePhoto && !photoData) { photoData = null; photoOriginalData = null; }
  if (photoData === undefined) redirect(`${path}?error=invalid`);
  try { await updateSchoolStudentPhoto(t.organizationId, studentId, photoData, photoOriginalData); }
  catch (e) { fail(path, e); }
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

export async function updateGuardianPhotoAction(f: FormData) {
  const path = "/app/school/students";
  const t = await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE, path);
  const guardianId = clean(f.get("guardianId"));
  if (!guardianId) redirect(`${path}?error=invalid`);
  const removePhoto = f.get("removePhoto") === "on";
  const photoFile = f.get("photo");
  let photoData: string | null | undefined;
  try {
    photoData = photoFile instanceof File ? (await schoolPhotoImageData(photoFile)) ?? undefined : undefined;
  } catch {
    redirect(`${path}?error=invalid`);
  }
  if (removePhoto && !photoData) photoData = null;
  if (photoData === undefined) redirect(`${path}?error=invalid`);
  try { await updateSchoolGuardianPhoto(t.organizationId, guardianId, photoData); }
  catch (e) { fail(path, e); }
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

export async function issueStudentIdAction(studentId: string, f: FormData) {
  const path = `/app/school/students/${studentId}?section=passport`;
  const tenant = await auth(PERMISSIONS.SCHOOL_DIGITAL_ID_MANAGE, path);
  const parsed = z.object({ reissuedFromId: cuid.nullable() }).safeParse({ reissuedFromId: clean(f.get("reissuedFromId")) });
  if (!parsed.success) redirect(`${path}&error=invalid`);
  try { await issueSchoolDigitalId(tenant.organizationId, studentId, tenant.userId, getSurfaceOrigins().tenant, parsed.data.reissuedFromId ?? undefined); }
  catch (error) { fail(path, error); }
  revalidatePath(`/app/school/students/${studentId}`);
  redirect(`${path}&saved=id-issued`);
}

export async function revokeStudentIdAction(studentId: string, f: FormData) {
  const path = `/app/school/students/${studentId}?section=passport`;
  const tenant = await auth(PERMISSIONS.SCHOOL_DIGITAL_ID_MANAGE, path);
  const parsed = z.object({ cardId: cuid, reason: shortText }).safeParse({ cardId: clean(f.get("cardId")), reason: clean(f.get("reason")) });
  if (!parsed.success) redirect(`${path}&error=invalid`);
  try { await revokeSchoolDigitalId(tenant.organizationId, parsed.data.cardId, tenant.userId, parsed.data.reason); }
  catch (error) { fail(path, error); }
  revalidatePath(`/app/school/students/${studentId}`);
  redirect(`${path}&saved=id-revoked`);
}

export async function recordStudentIdPrintAction(studentId: string, f: FormData) {
  const path = `/app/school/students/${studentId}?section=passport`;
  const tenant = await auth(PERMISSIONS.SCHOOL_DIGITAL_ID_MANAGE, path);
  const cardId = clean(f.get("cardId"));
  if (!cardId) redirect(`${path}&error=invalid`);
  try { await recordSchoolIdPrint(tenant.organizationId, cardId, tenant.userId); }
  catch (error) { fail(path, error); }
  revalidatePath(`/app/school/students/${studentId}`);
  redirect(`${path}&saved=id-printed`);
}

export async function createConductRecordAction(studentId: string, f: FormData) {
  const path = `/app/school/students/${studentId}?section=attendance`;
  const tenant = await auth(PERMISSIONS.SCHOOL_CONDUCT_MANAGE, path);
  const parsed = parseWithSchema(z.object({ campusId: cuid, occurredAt: dateInput, category: shortText, classification: z.enum(["POSITIVE", "NEGATIVE"]), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), description: longText, assignedReviewerId: cuid.nullable(), followUpDate: dateInput.nullable() }), { campusId: clean(f.get("campusId")) ?? "", occurredAt: clean(f.get("occurredAt")), category: clean(f.get("category")) ?? "", classification: clean(f.get("classification")), severity: clean(f.get("severity")), description: clean(f.get("description")) ?? "", assignedReviewerId: clean(f.get("assignedReviewerId")), followUpDate: clean(f.get("followUpDate")) });
  if (!parsed.success) redirect(`${path}&error=invalid`);
  try { await createSchoolConductRecord(tenant.organizationId, tenant.userId, { ...parsed.data, studentId }); }
  catch (error) { fail(path, error); }
  revalidatePath(`/app/school/students/${studentId}`);
  redirect(`${path}&saved=conduct`);
}

export async function createFeeStructureAction(f: FormData) {
  const path = "/app/school/fees";
  const tenant = await auth(PERMISSIONS.SCHOOL_FEES_MANAGE, path);
  const parsed = parseWithSchema(z.object({
    campusId: cuid,
    academicYearId: cuid,
    termId: cuid.nullable(),
    classId: cuid.nullable(),
    name: shortText,
    description: longText.nullable(),
    amount: moneyAmountPositive,
    dueDate: dateInput.nullable(),
  }), {
    campusId: clean(f.get("campusId")) ?? "",
    academicYearId: clean(f.get("academicYearId")) ?? "",
    termId: clean(f.get("termId")),
    classId: clean(f.get("classId")),
    name: clean(f.get("name")) ?? "",
    description: clean(f.get("description")),
    amount: clean(f.get("amount")),
    dueDate: clean(f.get("dueDate")),
  });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await createSchoolFeeStructure(tenant.organizationId, parsed.data); }
  catch (error) { fail(path, error); }
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

export async function issueFeeStructureAction(f: FormData) {
  const path = "/app/school/fees";
  const tenant = await auth(PERMISSIONS.SCHOOL_FEES_MANAGE, path);
  const feeStructureId = clean(f.get("feeStructureId"));
  if (!feeStructureId || !cuid.safeParse(feeStructureId).success) redirect(`${path}?error=invalid`);
  const result = await issueSchoolFeeStructure(tenant.organizationId, feeStructureId).catch((error) => fail(path, error));
  revalidatePath(path);
  revalidatePath("/app/school/reports");
  redirect(`${path}?saved=1&issued=${result.issued}&skipped=${result.skipped}`);
}
