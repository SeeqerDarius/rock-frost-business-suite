"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import { cuid, shortText, longText, dateInput, moneyAmountPositive, parseWithSchema } from "@/lib/validation";
import { createSchoolCampus, createSchoolAcademicYear, closeSchoolAcademicYear, deleteSchoolAcademicYear, createSchoolTerm, admitSchoolStudent, createSchoolGuardian, linkSchoolGuardian, createSchoolClass, updateSchoolClassCapacity, assignSchoolClassTeacher, removeSchoolClassTeacher, createSchoolSubject, enrollSchoolStudent, recordSchoolAttendanceBulk, createSchoolFeeInvoice, recordSchoolFeePayment, createSchoolTimetableEntry, createSchoolExam, recordSchoolExamResult, submitSchoolExamForModeration, publishSchoolExam, createSchoolLibraryBook, borrowSchoolLibraryBook, returnSchoolLibraryBook, createSchoolTransportRoute, assignSchoolTransport, createSchoolPayrollAdjustment, upsertSchoolSettings, transitionSchoolStudent, createSchoolFeeStructure, issueSchoolFeeStructure, updateSchoolStudentPhoto, updateSchoolGuardianPhoto, SchoolStateError, SchoolNotFoundError } from "@/modules/school/service";
import { schoolPhotoImageData, schoolStudentPhotoImages } from "@/lib/school-photo-image";
import { postModuleRevenue } from "@/lib/accounting-integration";
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

  // Guardian fields are optional on this form: admitting a student's first
  // guardian no longer requires the separate "Add guardian" + "Link
  // guardian" round trip. First/last name and phone together signal intent
  // to add one; relationship is required alongside them so the link is
  // meaningful.
  const guardianFirstName = clean(f.get("guardianFirstName"));
  const guardianLastName = clean(f.get("guardianLastName"));
  const guardianPhone = clean(f.get("guardianPhone"));
  const guardianRelationship = clean(f.get("guardianRelationship"));
  const hasGuardianInput = Boolean(guardianFirstName || guardianLastName || guardianPhone || guardianRelationship);
  let guardianData: Parameters<typeof admitSchoolStudent>[2] = null;
  if (hasGuardianInput) {
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
  }

  try{await admitSchoolStudent(t.organizationId,p.data,guardianData)}catch(e){fail(path,e)}
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}
export async function createGuardianAction(f:FormData){const path="/app/school/students",t=await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE,path);const p=z.object({firstName:shortText,lastName:shortText,email:z.string().email().nullable(),phone:shortText,address:longText.nullable(),occupation:shortText.nullable()}).safeParse({firstName:clean(f.get("firstName")),lastName:clean(f.get("lastName")),email:clean(f.get("email")),phone:clean(f.get("phone")),address:clean(f.get("address")),occupation:clean(f.get("occupation"))});if(!p.success)redirect(`${path}?error=invalid`);await createSchoolGuardian(t.organizationId,p.data);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function linkGuardianAction(f:FormData){const path="/app/school/students",t=await auth(PERMISSIONS.SCHOOL_STUDENTS_MANAGE,path);const p=z.object({studentId:cuid,guardianId:cuid,relationship:shortText,primary:z.boolean()}).safeParse({studentId:clean(f.get("studentId")),guardianId:clean(f.get("guardianId")),relationship:clean(f.get("relationship")),primary:f.get("primary")==="on"});if(!p.success)redirect(`${path}?error=invalid`);try{await linkSchoolGuardian(t.organizationId,p.data.studentId,p.data.guardianId,p.data.relationship,p.data.primary)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function createClassAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({campusId:cuid,code:shortText,name:shortText,gradeLevel:shortText.nullable(),capacity:z.coerce.number().int().positive().max(10000).nullable()}).safeParse({campusId:clean(f.get("campusId")),code:clean(f.get("code")),name:clean(f.get("name")),gradeLevel:clean(f.get("gradeLevel")),capacity:clean(f.get("capacity"))?clean(f.get("capacity")):null});if(!p.success)redirect(`${path}?error=invalid`);await createSchoolClass(t.organizationId,p.data);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function updateClassCapacityAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({classId:cuid,capacity:z.coerce.number().int().positive().max(10000).nullable()}).safeParse({classId:clean(f.get("classId")),capacity:clean(f.get("capacity"))?clean(f.get("capacity")):null});if(!p.success)redirect(`${path}?error=invalid`);try{await updateSchoolClassCapacity(t.organizationId,p.data.classId,p.data.capacity)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function assignClassTeacherAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({classId:cuid,userId:cuid}).safeParse({classId:clean(f.get("classId")),userId:clean(f.get("userId"))});if(!p.success)redirect(`${path}?error=invalid`);try{await assignSchoolClassTeacher(t.organizationId,p.data.classId,p.data.userId)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function removeClassTeacherAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({classId:cuid,userId:cuid}).safeParse({classId:clean(f.get("classId")),userId:clean(f.get("userId"))});if(!p.success)redirect(`${path}?error=invalid`);await removeSchoolClassTeacher(t.organizationId,p.data.classId,p.data.userId);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function createSubjectAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ACADEMICS_MANAGE,path);const p=z.object({code:shortText,name:shortText,description:longText.nullable()}).safeParse({code:clean(f.get("code")),name:clean(f.get("name")),description:clean(f.get("description"))});if(!p.success)redirect(`${path}?error=invalid`);await createSchoolSubject(t.organizationId,p.data);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function enrollStudentAction(f:FormData){const path="/app/school/classes",t=await auth(PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE,path);const p=z.object({campusId:cuid,academicYearId:cuid,studentId:cuid,classId:cuid}).safeParse(Object.fromEntries(["campusId","academicYearId","studentId","classId"].map(k=>[k,clean(f.get(k))])));if(!p.success)redirect(`${path}?error=invalid`);try{await enrollSchoolStudent(t.organizationId,p.data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
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
  const entries: Array<{ studentId: string; status: z.infer<typeof statusSchema>; reason: string | null }> = [];
  for (const [key, value] of f.entries()) {
    const match = /^status_(.+)$/.exec(key);
    if (!match) continue;
    const status = statusSchema.safeParse(value);
    if (!status.success) continue;
    const studentId = match[1];
    entries.push({ studentId, status: status.data, reason: clean(f.get(`reason_${studentId}`)) });
  }
  if (entries.length === 0) redirect(`${path}?error=invalid`);

  try {
    const result = await recordSchoolAttendanceBulk(t.organizationId, t.userId, { ...head.data, entries });
    revalidatePath(path);
    redirect(`${path}?saved=1&count=${result.saved}${result.skipped > 0 ? `&skipped=${result.skipped}` : ""}`);
  } catch (e) {
    fail(path, e);
  }
}
export async function createFeeInvoiceAction(f:FormData){const path="/app/school/fees",t=await auth(PERMISSIONS.SCHOOL_FEES_MANAGE,path);const p=parseWithSchema(z.object({academicYearId:cuid,termId:cuid.nullable(),studentId:cuid,description:shortText,amount:moneyAmountPositive,discount:z.coerce.number().min(0),dueDate:dateInput.nullable()}),{academicYearId:clean(f.get("academicYearId"))??"",termId:clean(f.get("termId")),studentId:clean(f.get("studentId"))??"",description:clean(f.get("description"))??"",amount:clean(f.get("amount")),discount:clean(f.get("discount"))??"0",dueDate:clean(f.get("dueDate"))});if(!p.success)redirect(`${path}?error=invalid`);try{await createSchoolFeeInvoice(t.organizationId,p.data)}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
export async function recordFeePaymentAction(f:FormData){const path="/app/school/fees",t=await auth(PERMISSIONS.SCHOOL_FEES_MANAGE,path);const p=parseWithSchema(z.object({invoiceId:cuid,amount:moneyAmountPositive,method:z.enum(["CASH","CARD","MOBILE_MONEY","BANK_TRANSFER","ONLINE","OTHER"]),reference:shortText.nullable()}),{invoiceId:clean(f.get("invoiceId"))??"",amount:clean(f.get("amount")),method:clean(f.get("method")),reference:clean(f.get("reference"))});if(!p.success)redirect(`${path}?error=invalid`);const{invoiceId,...data}=p.data;try{const payment=await recordSchoolFeePayment(t.organizationId,invoiceId,data);await postModuleRevenue(t.organizationId,{sourceModule:"school",sourceType:"SCHOOL_FEE_PAYMENT",sourceId:payment.id,postingPurpose:"COLLECTED",amount:payment.amount.toString(),entryDate:payment.receivedAt,description:`School fee payment received: receipt ${payment.receiptNumber}`,createdById:t.userId})}catch(e){fail(path,e)}revalidatePath(path);redirect(`${path}?saved=1`)}
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
export async function createPayrollAdjustmentAction(f:FormData){const path="/app/school/payroll",t=await auth(PERMISSIONS.SCHOOL_PAYROLL_MANAGE,path);const p=parseWithSchema(z.object({employeeId:shortText,period:shortText,type:shortText,description:shortText,amount:moneyAmountPositive}),Object.fromEntries(["employeeId","period","type","description","amount"].map(k=>[k,clean(f.get(k))??""])));if(!p.success)redirect(`${path}?error=invalid`);await createSchoolPayrollAdjustment(t.organizationId,p.data);revalidatePath(path);redirect(`${path}?saved=1`)}
export async function upsertSchoolSettingsAction(f:FormData){const path="/app/school/settings",t=await auth(PERMISSIONS.SCHOOL_SETTINGS_MANAGE,path);const p=z.object({campusId:cuid,attendanceCloseDays:z.coerce.number().int().min(0).max(365),receiptPrefix:shortText,allowRanking:z.boolean(),gradingScaleText:longText.nullable()}).safeParse({campusId:clean(f.get("campusId")),attendanceCloseDays:clean(f.get("attendanceCloseDays")),receiptPrefix:clean(f.get("receiptPrefix")),allowRanking:f.get("allowRanking")==="on",gradingScaleText:clean(f.get("gradingScaleText"))});if(!p.success)redirect(`${path}?error=invalid`);let gradingScale;try{gradingScale=p.data.gradingScaleText?JSON.parse(p.data.gradingScaleText):undefined}catch{redirect(`${path}?error=invalid`)}await upsertSchoolSettings(t.organizationId,{campusId:p.data.campusId,attendanceCloseDays:p.data.attendanceCloseDays,receiptPrefix:p.data.receiptPrefix,allowRanking:p.data.allowRanking,gradingScale});revalidatePath(path);redirect(`${path}?saved=1`)}

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
