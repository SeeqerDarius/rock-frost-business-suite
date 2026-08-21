"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cuid, shortText, longText, moneyAmountPositive, dateInput, parseWithSchema } from "@/lib/validation";
import * as hospital from "@/modules/hospital/service";

const clean = (value: FormDataEntryValue | null) => { const text = String(value ?? "").trim(); return text || null; };
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
/** An HTML datetime-local input's value ("YYYY-MM-DDTHH:mm"), parsed to a real Date. */
const dateTimeInput = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Must be a valid date and time.").transform((value) => new Date(value)).refine((date) => !Number.isNaN(date.getTime()), "Must be a valid date and time.");
const sexEnum = z.enum(["MALE", "FEMALE", "OTHER"]);
const abnormalFlag = z.enum(["NORMAL", "LOW", "HIGH", "CRITICAL"]);
const paymentMethod = z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "INSURANCE", "OTHER"]);
const claimStatus = z.enum(["SUBMITTED", "IN_REVIEW", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "PAID"]);
const disposition = z.enum(["PENDING", "DISCHARGED_HOME", "ADMITTED", "REFERRED", "DECEASED", "TRANSFERRED"]);
const alertSeverity = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const referralStatus = z.enum(["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"]);
const consentType = z.enum(["TREATMENT", "PROCEDURE", "DATA_SHARING", "OTHER"]);
const attachmentCategory = z.enum(["LAB_EXTERNAL", "IMAGING_EXTERNAL", "DOCUMENT", "OTHER"]);
const encounterType = z.enum(["OUTPATIENT", "INPATIENT", "EMERGENCY"]);
const noteType = z.enum(["PROGRESS", "TRIAGE", "DISCHARGE_SUMMARY", "CARE_PLAN", "ADDENDUM"]);
const diagnosisType = z.enum(["PRIMARY", "SECONDARY"]);
const nursingTaskStatus = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

async function authorize(permission: string, path: string) {
  const tenant = await requireModuleAccess("hospital");
  if (!hasPermission(tenant, permission)) redirect(`${path}?error=forbidden`);
  return tenant;
}

function handleServiceError(error: unknown, path: string, notFoundParam = "not-found", conflictParam = "conflict"): never {
  if (error instanceof hospital.HospitalNotFoundError) redirect(`${path}?error=${notFoundParam}`);
  if (error instanceof hospital.HospitalStateError) redirect(`${path}?error=${conflictParam}`);
  throw error;
}

// --- Facility configuration ---

export async function createFacilityAction(formData: FormData) {
  const path = "/app/hospital/facility"; const tenant = await authorize(PERMISSIONS.HOSPITAL_FACILITY_MANAGE, path);
  const parsed = parseWithSchema(z.object({ code: shortText, name: shortText, address: longText.nullable(), phone: shortText.nullable(), email: z.string().email().nullable(), timezone: shortText, currency: z.string().trim().length(3) }), { code: clean(formData.get("code")) ?? "", name: clean(formData.get("name")) ?? "", address: clean(formData.get("address")), phone: clean(formData.get("phone")), email: clean(formData.get("email")), timezone: clean(formData.get("timezone")) ?? "UTC", currency: clean(formData.get("currency")) ?? "USD" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  await hospital.createHospitalFacility(tenant.organizationId, parsed.data); revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createDepartmentAction(formData: FormData) {
  const path = "/app/hospital/facility"; const tenant = await authorize(PERMISSIONS.HOSPITAL_FACILITY_MANAGE, path);
  const parsed = parseWithSchema(z.object({ facilityId: cuid, code: shortText, name: shortText }), { facilityId: clean(formData.get("facilityId")) ?? "", code: clean(formData.get("code")) ?? "", name: clean(formData.get("name")) ?? "" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalDepartment(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createServiceItemAction(formData: FormData) {
  const path = "/app/hospital/facility"; const tenant = await authorize(PERMISSIONS.HOSPITAL_FACILITY_MANAGE, path);
  const parsed = parseWithSchema(z.object({ facilityId: cuid, code: shortText, name: shortText, category: shortText.nullable(), price: moneyAmountPositive }), { facilityId: clean(formData.get("facilityId")) ?? "", code: clean(formData.get("code")) ?? "", name: clean(formData.get("name")) ?? "", category: clean(formData.get("category")), price: clean(formData.get("price")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalServiceItem(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createProviderAction(formData: FormData) {
  const path = "/app/hospital/facility"; const tenant = await authorize(PERMISSIONS.HOSPITAL_FACILITY_MANAGE, path);
  const parsed = parseWithSchema(z.object({ facilityId: cuid, departmentId: cuid.nullable(), name: shortText, title: shortText.nullable(), specialty: shortText.nullable() }), { facilityId: clean(formData.get("facilityId")) ?? "", departmentId: clean(formData.get("departmentId")), name: clean(formData.get("name")) ?? "", title: clean(formData.get("title")), specialty: clean(formData.get("specialty")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalProvider(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createWardAction(formData: FormData) {
  const path = "/app/hospital/facility"; const tenant = await authorize(PERMISSIONS.HOSPITAL_FACILITY_MANAGE, path);
  const parsed = parseWithSchema(z.object({ facilityId: cuid, code: shortText, name: shortText }), { facilityId: clean(formData.get("facilityId")) ?? "", code: clean(formData.get("code")) ?? "", name: clean(formData.get("name")) ?? "" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalWard(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createBedAction(formData: FormData) {
  const path = "/app/hospital/facility"; const tenant = await authorize(PERMISSIONS.HOSPITAL_FACILITY_MANAGE, path);
  const parsed = parseWithSchema(z.object({ wardId: cuid, code: shortText }), { wardId: clean(formData.get("wardId")) ?? "", code: clean(formData.get("code")) ?? "" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalBed(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

// --- Patients ---

export async function createPatientAction(formData: FormData) {
  const path = "/app/hospital/patients"; const tenant = await authorize(PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, path);
  const parsed = parseWithSchema(z.object({
    firstName: shortText, lastName: shortText, dateOfBirth: dateInput, sex: sexEnum,
    phone: shortText.nullable(), email: z.string().email().nullable(), address: longText.nullable(),
    nationalIdType: shortText.nullable(), nationalIdNumber: shortText.nullable(), bloodGroup: shortText.nullable(),
    allergies: longText.nullable(), alerts: longText.nullable(),
    nextOfKinName: shortText.nullable(), nextOfKinPhone: shortText.nullable(), nextOfKinRelationship: shortText.nullable(),
    emergencyContactName: shortText.nullable(), emergencyContactPhone: shortText.nullable(), emergencyContactRelation: shortText.nullable(),
    consentOnFile: z.boolean(), notes: longText.nullable(),
  }), {
    firstName: clean(formData.get("firstName")) ?? "", lastName: clean(formData.get("lastName")) ?? "", dateOfBirth: clean(formData.get("dateOfBirth")), sex: clean(formData.get("sex")),
    phone: clean(formData.get("phone")), email: clean(formData.get("email")), address: clean(formData.get("address")),
    nationalIdType: clean(formData.get("nationalIdType")), nationalIdNumber: clean(formData.get("nationalIdNumber")), bloodGroup: clean(formData.get("bloodGroup")),
    allergies: clean(formData.get("allergies")), alerts: clean(formData.get("alerts")),
    nextOfKinName: clean(formData.get("nextOfKinName")), nextOfKinPhone: clean(formData.get("nextOfKinPhone")), nextOfKinRelationship: clean(formData.get("nextOfKinRelationship")),
    emergencyContactName: clean(formData.get("emergencyContactName")), emergencyContactPhone: clean(formData.get("emergencyContactPhone")), emergencyContactRelation: clean(formData.get("emergencyContactRelation")),
    consentOnFile: formData.get("consentOnFile") === "on", notes: clean(formData.get("notes")),
  });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  await hospital.createHospitalPatient(tenant.organizationId, parsed.data); revalidatePath(path); redirect(`${path}?saved=1`);
}

export interface PatientDuplicateCheckState {
  duplicates?: { id: string; mrn: string; firstName: string; lastName: string; dateOfBirth: string }[];
  error?: string;
}

/**
 * Advisory only — never blocks registration. A client component calls this
 * via useActionState as the first/last name and date-of-birth fields are
 * filled in; the actual createPatientAction submit is unaffected either way.
 */
export async function checkPatientDuplicatesAction(_previousState: PatientDuplicateCheckState, formData: FormData): Promise<PatientDuplicateCheckState> {
  const tenant = await requireModuleAccess("hospital");
  if (!hasPermission(tenant, PERMISSIONS.HOSPITAL_PATIENTS_MANAGE)) return { error: "Not authorized." };
  const firstName = clean(formData.get("firstName")); const lastName = clean(formData.get("lastName")); const dateOfBirthRaw = clean(formData.get("dateOfBirth"));
  if (!firstName || !lastName || !dateOfBirthRaw) return {};
  const dateOfBirth = new Date(dateOfBirthRaw);
  if (Number.isNaN(dateOfBirth.getTime())) return {};
  const duplicates = await hospital.findHospitalPatientDuplicates(tenant.organizationId, firstName, lastName, dateOfBirth);
  return { duplicates: duplicates.map((patient) => ({ id: patient.id, mrn: patient.mrn, firstName: patient.firstName, lastName: patient.lastName, dateOfBirth: patient.dateOfBirth.toISOString() })) };
}

// --- Appointments ---

export async function createAppointmentAction(formData: FormData) {
  const path = "/app/hospital/appointments"; const tenant = await authorize(PERMISSIONS.HOSPITAL_APPOINTMENTS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ facilityId: cuid, departmentId: cuid.nullable(), providerId: cuid, patientId: cuid, scheduledStart: dateTimeInput, scheduledEnd: dateTimeInput, reason: shortText }), { facilityId: clean(formData.get("facilityId")) ?? "", departmentId: clean(formData.get("departmentId")), providerId: clean(formData.get("providerId")) ?? "", patientId: clean(formData.get("patientId")) ?? "", scheduledStart: clean(formData.get("scheduledStart")), scheduledEnd: clean(formData.get("scheduledEnd")), reason: clean(formData.get("reason")) ?? "" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalAppointment(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function checkInAppointmentAction(formData: FormData) {
  const path = "/app/hospital/appointments"; const tenant = await authorize(PERMISSIONS.HOSPITAL_APPOINTMENTS_MANAGE, path);
  const id = clean(formData.get("appointmentId")); if (!id) redirect(`${path}?error=invalid`);
  try { await hospital.checkInHospitalAppointment(tenant.organizationId, id); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function cancelAppointmentAction(formData: FormData) {
  const path = "/app/hospital/appointments"; const tenant = await authorize(PERMISSIONS.HOSPITAL_APPOINTMENTS_MANAGE, path);
  const id = clean(formData.get("appointmentId")); const reason = clean(formData.get("reason")) ?? "Cancelled"; if (!id) redirect(`${path}?error=invalid`);
  try { await hospital.cancelHospitalAppointment(tenant.organizationId, id, reason); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function noShowAppointmentAction(formData: FormData) {
  const path = "/app/hospital/appointments"; const tenant = await authorize(PERMISSIONS.HOSPITAL_APPOINTMENTS_MANAGE, path);
  const id = clean(formData.get("appointmentId")); if (!id) redirect(`${path}?error=invalid`);
  try { await hospital.markHospitalAppointmentNoShow(tenant.organizationId, id); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

// --- Encounters ---

export async function createEncounterAction(formData: FormData) {
  const path = "/app/hospital/encounters"; const tenant = await authorize(PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ facilityId: cuid, patientId: cuid, providerId: cuid, appointmentId: cuid.nullable(), type: encounterType, chiefComplaint: shortText.nullable() }), { facilityId: clean(formData.get("facilityId")) ?? "", patientId: clean(formData.get("patientId")) ?? "", providerId: clean(formData.get("providerId")) ?? "", appointmentId: clean(formData.get("appointmentId")), type: clean(formData.get("type")), chiefComplaint: clean(formData.get("chiefComplaint")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  let encounter: Awaited<ReturnType<typeof hospital.createHospitalEncounter>>;
  try { encounter = await hospital.createHospitalEncounter(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`/app/hospital/encounters/${encounter.id}?saved=1`);
}

export async function recordVitalsAction(formData: FormData) {
  const encounterId = clean(formData.get("encounterId")) ?? ""; const path = `/app/hospital/encounters/${encounterId}`;
  const tenant = await authorize(PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, path);
  const parsed = z.object({
    temperatureC: z.coerce.number().min(25).max(45).nullable(), pulseBpm: int(0, 300).nullable(), respiratoryRate: int(0, 100).nullable(),
    bloodPressureSystolic: int(0, 300).nullable(), bloodPressureDiastolic: int(0, 200).nullable(), spo2: int(0, 100).nullable(),
    weightKg: z.coerce.number().min(0).max(500).nullable(), heightCm: z.coerce.number().min(0).max(300).nullable(), notes: longText.nullable(),
  }).safeParse({
    temperatureC: clean(formData.get("temperatureC")), pulseBpm: clean(formData.get("pulseBpm")), respiratoryRate: clean(formData.get("respiratoryRate")),
    bloodPressureSystolic: clean(formData.get("bloodPressureSystolic")), bloodPressureDiastolic: clean(formData.get("bloodPressureDiastolic")), spo2: clean(formData.get("spo2")),
    weightKg: clean(formData.get("weightKg")), heightCm: clean(formData.get("heightCm")), notes: clean(formData.get("notes")),
  });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.recordHospitalVitals(tenant.organizationId, encounterId, { ...parsed.data, recordedById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function addClinicalNoteAction(formData: FormData) {
  const encounterId = clean(formData.get("encounterId")) ?? ""; const path = `/app/hospital/encounters/${encounterId}`;
  const tenant = await authorize(PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ type: noteType, content: longText.min(1), sign: z.boolean(), correctsNoteId: cuid.nullable() }), { type: clean(formData.get("type")), content: clean(formData.get("content")) ?? "", sign: formData.get("sign") === "on", correctsNoteId: clean(formData.get("correctsNoteId")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.addHospitalClinicalNote(tenant.organizationId, encounterId, { ...parsed.data, authorId: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function signClinicalNoteAction(formData: FormData) {
  const encounterId = clean(formData.get("encounterId")) ?? ""; const path = `/app/hospital/encounters/${encounterId}`;
  const tenant = await authorize(PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, path);
  const noteId = clean(formData.get("noteId")); if (!noteId) redirect(`${path}?error=invalid`);
  try { await hospital.signHospitalClinicalNote(tenant.organizationId, noteId); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function addDiagnosisAction(formData: FormData) {
  const encounterId = clean(formData.get("encounterId")) ?? ""; const path = `/app/hospital/encounters/${encounterId}`;
  const tenant = await authorize(PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ code: shortText.nullable(), description: shortText, type: diagnosisType }), { code: clean(formData.get("code")), description: clean(formData.get("description")) ?? "", type: clean(formData.get("type")) ?? "PRIMARY" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.addHospitalDiagnosis(tenant.organizationId, encounterId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function addCarePlanAction(formData: FormData) {
  const encounterId = clean(formData.get("encounterId")) ?? ""; const path = `/app/hospital/encounters/${encounterId}`;
  const tenant = await authorize(PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ goal: shortText, instructions: longText.nullable(), followUpDate: dateInput.nullable() }), { goal: clean(formData.get("goal")) ?? "", instructions: clean(formData.get("instructions")), followUpDate: clean(formData.get("followUpDate")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.addHospitalCarePlan(tenant.organizationId, encounterId, { ...parsed.data, createdById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function closeEncounterAction(formData: FormData) {
  const encounterId = clean(formData.get("encounterId")) ?? ""; const path = `/app/hospital/encounters/${encounterId}`;
  const tenant = await authorize(PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, path);
  const parsed = z.object({ disposition }).safeParse({ disposition: clean(formData.get("disposition")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.closeHospitalEncounter(tenant.organizationId, encounterId, parsed.data.disposition); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); revalidatePath("/app/hospital/encounters"); redirect(`${path}?saved=1`);
}

// --- Admissions & beds ---

export async function admitPatientAction(formData: FormData) {
  const path = "/app/hospital/admissions"; const tenant = await authorize(PERMISSIONS.HOSPITAL_ADMISSIONS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ facilityId: cuid, patientId: cuid, encounterId: cuid, admittingProviderId: cuid, bedId: cuid, expectedDischargeDate: dateInput.nullable() }), { facilityId: clean(formData.get("facilityId")) ?? "", patientId: clean(formData.get("patientId")) ?? "", encounterId: clean(formData.get("encounterId")) ?? "", admittingProviderId: clean(formData.get("admittingProviderId")) ?? "", bedId: clean(formData.get("bedId")) ?? "", expectedDischargeDate: clean(formData.get("expectedDischargeDate")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.admitHospitalPatient(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function transferBedAction(formData: FormData) {
  const path = "/app/hospital/admissions"; const tenant = await authorize(PERMISSIONS.HOSPITAL_ADMISSIONS_MANAGE, path);
  const admissionId = clean(formData.get("admissionId")); const toBedId = clean(formData.get("toBedId")); const reason = clean(formData.get("reason"));
  if (!admissionId || !toBedId) redirect(`${path}?error=invalid`);
  try { await hospital.transferHospitalBed(tenant.organizationId, admissionId, toBedId, reason); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function dischargePatientAction(formData: FormData) {
  const path = "/app/hospital/admissions"; const tenant = await authorize(PERMISSIONS.HOSPITAL_ADMISSIONS_MANAGE, path);
  const admissionId = clean(formData.get("admissionId")); const dischargeSummary = clean(formData.get("dischargeSummary"));
  if (!admissionId) redirect(`${path}?error=invalid`);
  try { await hospital.dischargeHospitalPatient(tenant.organizationId, admissionId, dischargeSummary); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

// --- Laboratory ---

export async function createLabTestAction(formData: FormData) {
  const path = "/app/hospital/laboratory"; const tenant = await authorize(PERMISSIONS.HOSPITAL_LAB_ENTER, path);
  const parsed = parseWithSchema(z.object({ code: shortText, name: shortText, specimenType: shortText.nullable(), price: moneyAmountPositive }), { code: clean(formData.get("code")) ?? "", name: clean(formData.get("name")) ?? "", specimenType: clean(formData.get("specimenType")), price: clean(formData.get("price")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  await hospital.createHospitalLabTest(tenant.organizationId, parsed.data); revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createLabOrderAction(formData: FormData) {
  const path = "/app/hospital/laboratory"; const tenant = await authorize(PERMISSIONS.HOSPITAL_LAB_ENTER, path);
  const testIds = formData.getAll("testIds").map((value) => String(value)).filter(Boolean);
  const parsed = parseWithSchema(z.object({ encounterId: cuid, patientId: cuid, testIds: z.array(cuid).min(1) }), { encounterId: clean(formData.get("encounterId")) ?? "", patientId: clean(formData.get("patientId")) ?? "", testIds });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalLabOrder(tenant.organizationId, { ...parsed.data, orderedById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function collectSpecimenAction(formData: FormData) {
  const path = "/app/hospital/laboratory"; const tenant = await authorize(PERMISSIONS.HOSPITAL_LAB_ENTER, path);
  const itemId = clean(formData.get("itemId")); if (!itemId) redirect(`${path}?error=invalid`);
  try { await hospital.collectHospitalLabSpecimen(tenant.organizationId, itemId); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function enterLabResultAction(formData: FormData) {
  const path = "/app/hospital/laboratory"; const tenant = await authorize(PERMISSIONS.HOSPITAL_LAB_ENTER, path);
  const parsed = parseWithSchema(z.object({ itemId: cuid, value: shortText, unit: shortText.nullable(), referenceRange: shortText.nullable(), abnormalFlag }), { itemId: clean(formData.get("itemId")) ?? "", value: clean(formData.get("value")) ?? "", unit: clean(formData.get("unit")), referenceRange: clean(formData.get("referenceRange")), abnormalFlag: clean(formData.get("abnormalFlag")) ?? "NORMAL" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  const { itemId, ...data } = parsed.data;
  try { await hospital.enterHospitalLabResult(tenant.organizationId, itemId, { ...data, enteredById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function verifyLabResultAction(formData: FormData) {
  const path = "/app/hospital/laboratory"; const tenant = await authorize(PERMISSIONS.HOSPITAL_LAB_VERIFY, path);
  const resultId = clean(formData.get("resultId")); if (!resultId) redirect(`${path}?error=invalid`);
  try { await hospital.verifyHospitalLabResult(tenant.organizationId, resultId, tenant.userId); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function rejectLabResultAction(formData: FormData) {
  const path = "/app/hospital/laboratory"; const tenant = await authorize(PERMISSIONS.HOSPITAL_LAB_VERIFY, path);
  const resultId = clean(formData.get("resultId")); const reason = clean(formData.get("reason")) ?? ""; if (!resultId) redirect(`${path}?error=invalid`);
  try { await hospital.rejectHospitalLabResult(tenant.organizationId, resultId, tenant.userId, reason); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function correctLabResultAction(formData: FormData) {
  const path = "/app/hospital/laboratory"; const tenant = await authorize(PERMISSIONS.HOSPITAL_LAB_ENTER, path);
  const parsed = parseWithSchema(z.object({ priorResultId: cuid, value: shortText, unit: shortText.nullable(), referenceRange: shortText.nullable(), abnormalFlag, correctionReason: shortText }), { priorResultId: clean(formData.get("priorResultId")) ?? "", value: clean(formData.get("value")) ?? "", unit: clean(formData.get("unit")), referenceRange: clean(formData.get("referenceRange")), abnormalFlag: clean(formData.get("abnormalFlag")) ?? "NORMAL", correctionReason: clean(formData.get("correctionReason")) ?? "" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  const { priorResultId, ...data } = parsed.data;
  try { await hospital.correctHospitalLabResult(tenant.organizationId, priorResultId, { ...data, enteredById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

// --- Imaging ---

export async function createImagingTestAction(formData: FormData) {
  const path = "/app/hospital/imaging"; const tenant = await authorize(PERMISSIONS.HOSPITAL_IMAGING_ENTER, path);
  const parsed = parseWithSchema(z.object({ code: shortText, name: shortText, modality: shortText, price: moneyAmountPositive }), { code: clean(formData.get("code")) ?? "", name: clean(formData.get("name")) ?? "", modality: clean(formData.get("modality")) ?? "", price: clean(formData.get("price")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  await hospital.createHospitalImagingTest(tenant.organizationId, parsed.data); revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createImagingOrderAction(formData: FormData) {
  const path = "/app/hospital/imaging"; const tenant = await authorize(PERMISSIONS.HOSPITAL_IMAGING_ENTER, path);
  const parsed = parseWithSchema(z.object({ encounterId: cuid, patientId: cuid, imagingTestId: cuid }), { encounterId: clean(formData.get("encounterId")) ?? "", patientId: clean(formData.get("patientId")) ?? "", imagingTestId: clean(formData.get("imagingTestId")) ?? "" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalImagingOrder(tenant.organizationId, { ...parsed.data, orderedById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function scheduleImagingOrderAction(formData: FormData) {
  const path = "/app/hospital/imaging"; const tenant = await authorize(PERMISSIONS.HOSPITAL_IMAGING_ENTER, path);
  const parsed = parseWithSchema(z.object({ orderId: cuid, scheduledAt: dateTimeInput, externalAccessionNumber: shortText.nullable(), externalSystemReference: shortText.nullable() }), { orderId: clean(formData.get("orderId")) ?? "", scheduledAt: clean(formData.get("scheduledAt")), externalAccessionNumber: clean(formData.get("externalAccessionNumber")), externalSystemReference: clean(formData.get("externalSystemReference")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  const { orderId, scheduledAt, externalAccessionNumber, externalSystemReference } = parsed.data;
  try { await hospital.scheduleHospitalImagingOrder(tenant.organizationId, orderId, scheduledAt, externalAccessionNumber, externalSystemReference); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function enterImagingFindingAction(formData: FormData) {
  const path = "/app/hospital/imaging"; const tenant = await authorize(PERMISSIONS.HOSPITAL_IMAGING_ENTER, path);
  const parsed = parseWithSchema(z.object({ orderId: cuid, findings: longText.min(1), impression: longText.nullable() }), { orderId: clean(formData.get("orderId")) ?? "", findings: clean(formData.get("findings")) ?? "", impression: clean(formData.get("impression")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  const { orderId, ...data } = parsed.data;
  try { await hospital.enterHospitalImagingFinding(tenant.organizationId, orderId, { ...data, enteredById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function verifyImagingFindingAction(formData: FormData) {
  const path = "/app/hospital/imaging"; const tenant = await authorize(PERMISSIONS.HOSPITAL_IMAGING_VERIFY, path);
  const findingId = clean(formData.get("findingId")); if (!findingId) redirect(`${path}?error=invalid`);
  try { await hospital.verifyHospitalImagingFinding(tenant.organizationId, findingId, tenant.userId); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function rejectImagingFindingAction(formData: FormData) {
  const path = "/app/hospital/imaging"; const tenant = await authorize(PERMISSIONS.HOSPITAL_IMAGING_VERIFY, path);
  const findingId = clean(formData.get("findingId")); const reason = clean(formData.get("reason")) ?? ""; if (!findingId) redirect(`${path}?error=invalid`);
  try { await hospital.rejectHospitalImagingFinding(tenant.organizationId, findingId, tenant.userId, reason); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function correctImagingFindingAction(formData: FormData) {
  const path = "/app/hospital/imaging"; const tenant = await authorize(PERMISSIONS.HOSPITAL_IMAGING_ENTER, path);
  const parsed = parseWithSchema(z.object({ priorFindingId: cuid, findings: longText.min(1), impression: longText.nullable(), correctionReason: shortText }), { priorFindingId: clean(formData.get("priorFindingId")) ?? "", findings: clean(formData.get("findings")) ?? "", impression: clean(formData.get("impression")), correctionReason: clean(formData.get("correctionReason")) ?? "" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  const { priorFindingId, ...data } = parsed.data;
  try { await hospital.correctHospitalImagingFinding(tenant.organizationId, priorFindingId, { ...data, enteredById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

// --- Medication orders ---

export async function createMedicationOrderAction(formData: FormData) {
  const path = "/app/hospital/medication-orders"; const tenant = await authorize(PERMISSIONS.HOSPITAL_MEDICATIONS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ encounterId: cuid, patientId: cuid, medicationName: shortText, strength: shortText.nullable(), route: shortText.nullable(), dose: shortText, frequency: shortText, durationDays: int(1, 365).nullable(), instructions: longText.nullable() }), { encounterId: clean(formData.get("encounterId")) ?? "", patientId: clean(formData.get("patientId")) ?? "", medicationName: clean(formData.get("medicationName")) ?? "", strength: clean(formData.get("strength")), route: clean(formData.get("route")), dose: clean(formData.get("dose")) ?? "", frequency: clean(formData.get("frequency")) ?? "", durationDays: clean(formData.get("durationDays")), instructions: clean(formData.get("instructions")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalMedicationOrder(tenant.organizationId, { ...parsed.data, orderedById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function sendToPharmacyAction(formData: FormData) {
  const path = "/app/hospital/medication-orders"; const tenant = await authorize(PERMISSIONS.HOSPITAL_MEDICATIONS_MANAGE, path);
  const orderId = clean(formData.get("orderId")); const reference = clean(formData.get("externalDispenseReference")); if (!orderId) redirect(`${path}?error=invalid`);
  try { await hospital.markHospitalMedicationSentToPharmacy(tenant.organizationId, orderId, reference); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function cancelMedicationOrderAction(formData: FormData) {
  const path = "/app/hospital/medication-orders"; const tenant = await authorize(PERMISSIONS.HOSPITAL_MEDICATIONS_MANAGE, path);
  const orderId = clean(formData.get("orderId")); const reason = clean(formData.get("reason")) ?? "Cancelled"; if (!orderId) redirect(`${path}?error=invalid`);
  try { await hospital.cancelHospitalMedicationOrder(tenant.organizationId, orderId, reason); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

// --- Billing & claims ---

export async function createInvoiceAction(formData: FormData) {
  const path = "/app/hospital/billing"; const tenant = await authorize(PERMISSIONS.HOSPITAL_BILLING_MANAGE, path);
  const descriptions = formData.getAll("lineDescription").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const prices = formData.getAll("lineUnitPrice").map(String);
  const lineSchema = z.object({ description: shortText, quantity: int(1, 1000), unitPrice: moneyAmountPositive });
  const lines: { description: string; quantity: number; unitPrice: string }[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    if (!descriptions[i]?.trim()) continue;
    const line = lineSchema.safeParse({ description: descriptions[i], quantity: quantities[i] ?? "1", unitPrice: prices[i] });
    if (!line.success) redirect(`${path}?error=invalid`);
    lines.push(line.data);
  }
  const parsed = parseWithSchema(z.object({ facilityId: cuid, patientId: cuid, encounterId: cuid.nullable() }), { facilityId: clean(formData.get("facilityId")) ?? "", patientId: clean(formData.get("patientId")) ?? "", encounterId: clean(formData.get("encounterId")) });
  if (!parsed.success || lines.length === 0) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalInvoice(tenant.organizationId, { ...parsed.data, lines }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function recordPaymentAction(formData: FormData) {
  const path = "/app/hospital/billing"; const tenant = await authorize(PERMISSIONS.HOSPITAL_BILLING_MANAGE, path);
  const parsed = parseWithSchema(z.object({ invoiceId: cuid, amount: moneyAmountPositive, method: paymentMethod, reference: shortText.nullable() }), { invoiceId: clean(formData.get("invoiceId")) ?? "", amount: clean(formData.get("amount")), method: clean(formData.get("method")), reference: clean(formData.get("reference")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  const { invoiceId, ...data } = parsed.data;
  try { await hospital.recordHospitalPayment(tenant.organizationId, invoiceId, { ...data, receivedById: tenant.userId }); } catch (error) { handleServiceError(error, path, "not-found", "balance"); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function voidInvoiceAction(formData: FormData) {
  const path = "/app/hospital/billing"; const tenant = await authorize(PERMISSIONS.HOSPITAL_BILLING_MANAGE, path);
  const invoiceId = clean(formData.get("invoiceId")); const reason = clean(formData.get("reason")) ?? "Voided"; if (!invoiceId) redirect(`${path}?error=invalid`);
  try { await hospital.voidHospitalInvoice(tenant.organizationId, invoiceId, reason); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createInsuranceClaimAction(formData: FormData) {
  const path = "/app/hospital/billing"; const tenant = await authorize(PERMISSIONS.HOSPITAL_BILLING_MANAGE, path);
  const parsed = parseWithSchema(z.object({ invoiceId: cuid, patientId: cuid, insurerName: shortText, policyNumber: shortText, claimNumber: shortText.nullable() }), { invoiceId: clean(formData.get("invoiceId")) ?? "", patientId: clean(formData.get("patientId")) ?? "", insurerName: clean(formData.get("insurerName")) ?? "", policyNumber: clean(formData.get("policyNumber")) ?? "", claimNumber: clean(formData.get("claimNumber")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalInsuranceClaim(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function updateClaimStatusAction(formData: FormData) {
  const path = "/app/hospital/billing"; const tenant = await authorize(PERMISSIONS.HOSPITAL_BILLING_MANAGE, path);
  const parsed = z.object({ claimId: cuid, status: claimStatus, approvedAmount: z.string().trim().optional(), notes: longText.nullable() }).safeParse({ claimId: clean(formData.get("claimId")), status: clean(formData.get("status")), approvedAmount: clean(formData.get("approvedAmount")) ?? undefined, notes: clean(formData.get("notes")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  const { claimId, status, approvedAmount, notes } = parsed.data;
  try { await hospital.updateHospitalInsuranceClaimStatus(tenant.organizationId, claimId, status, approvedAmount, notes); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

// --- Nursing, alerts, referrals, consent, attachments ---

export async function createNursingTaskAction(formData: FormData) {
  const path = "/app/hospital/nursing"; const tenant = await authorize(PERMISSIONS.HOSPITAL_NURSING_MANAGE, path);
  const parsed = parseWithSchema(z.object({ patientId: cuid, encounterId: cuid.nullable(), description: shortText, dueAt: dateTimeInput.nullable() }), { patientId: clean(formData.get("patientId")) ?? "", encounterId: clean(formData.get("encounterId")), description: clean(formData.get("description")) ?? "", dueAt: clean(formData.get("dueAt")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalNursingTask(tenant.organizationId, { ...parsed.data, createdById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function updateNursingTaskStatusAction(formData: FormData) {
  const path = "/app/hospital/nursing"; const tenant = await authorize(PERMISSIONS.HOSPITAL_NURSING_MANAGE, path);
  const parsed = z.object({ taskId: cuid, status: nursingTaskStatus }).safeParse({ taskId: clean(formData.get("taskId")), status: clean(formData.get("status")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.updateHospitalNursingTaskStatus(tenant.organizationId, parsed.data.taskId, parsed.data.status, tenant.userId); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createClinicalAlertAction(formData: FormData) {
  const path = "/app/hospital/patients"; const tenant = await authorize(PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ patientId: cuid, type: shortText, description: shortText, severity: alertSeverity }), { patientId: clean(formData.get("patientId")) ?? "", type: clean(formData.get("type")) ?? "", description: clean(formData.get("description")) ?? "", severity: clean(formData.get("severity")) ?? "MEDIUM" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalClinicalAlert(tenant.organizationId, { ...parsed.data, createdById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function resolveClinicalAlertAction(formData: FormData) {
  const path = "/app/hospital/patients"; const tenant = await authorize(PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, path);
  const alertId = clean(formData.get("alertId")); if (!alertId) redirect(`${path}?error=invalid`);
  try { await hospital.resolveHospitalClinicalAlert(tenant.organizationId, alertId); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createReferralAction(formData: FormData) {
  const encounterId = clean(formData.get("encounterId")) ?? ""; const path = `/app/hospital/encounters/${encounterId}`;
  const tenant = await authorize(PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ patientId: cuid, referredToFacility: shortText, reason: shortText }), { patientId: clean(formData.get("patientId")) ?? "", referredToFacility: clean(formData.get("referredToFacility")) ?? "", reason: clean(formData.get("reason")) ?? "" });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalReferral(tenant.organizationId, { ...parsed.data, encounterId, referredById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function updateReferralStatusAction(formData: FormData) {
  const encounterId = clean(formData.get("encounterId")) ?? ""; const path = `/app/hospital/encounters/${encounterId}`;
  const tenant = await authorize(PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, path);
  const parsed = z.object({ referralId: cuid, status: referralStatus }).safeParse({ referralId: clean(formData.get("referralId")), status: clean(formData.get("status")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.updateHospitalReferralStatus(tenant.organizationId, parsed.data.referralId, parsed.data.status); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createConsentAction(formData: FormData) {
  const path = "/app/hospital/patients"; const tenant = await authorize(PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ patientId: cuid, type: consentType, description: shortText, consentedByName: shortText, documentReference: shortText.nullable() }), { patientId: clean(formData.get("patientId")) ?? "", type: clean(formData.get("type")) ?? "TREATMENT", description: clean(formData.get("description")) ?? "", consentedByName: clean(formData.get("consentedByName")) ?? "", documentReference: clean(formData.get("documentReference")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalConsent(tenant.organizationId, { ...parsed.data, witnessedById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function revokeConsentAction(formData: FormData) {
  const path = "/app/hospital/patients"; const tenant = await authorize(PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, path);
  const consentId = clean(formData.get("consentId")); if (!consentId) redirect(`${path}?error=invalid`);
  try { await hospital.revokeHospitalConsent(tenant.organizationId, consentId); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createAttachmentAction(formData: FormData) {
  const path = "/app/hospital/patients"; const tenant = await authorize(PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, path);
  const parsed = parseWithSchema(z.object({ patientId: cuid.nullable(), encounterId: cuid.nullable(), category: attachmentCategory, fileName: shortText, externalReference: shortText, description: shortText.nullable() }), { patientId: clean(formData.get("patientId")), encounterId: clean(formData.get("encounterId")), category: clean(formData.get("category")) ?? "DOCUMENT", fileName: clean(formData.get("fileName")) ?? "", externalReference: clean(formData.get("externalReference")) ?? "", description: clean(formData.get("description")) });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.createHospitalAttachment(tenant.organizationId, { ...parsed.data, uploadedById: tenant.userId }); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

// --- Settings ---

export async function upsertHospitalSettingsAction(formData: FormData) {
  const path = "/app/hospital/settings"; const tenant = await authorize(PERMISSIONS.HOSPITAL_SETTINGS_MANAGE, path);
  const prefix = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/);
  const parsed = z.object({
    facilityId: cuid, timezone: shortText, currency: z.string().trim().toUpperCase().length(3),
    mrnPrefix: prefix, encounterPrefix: prefix, appointmentPrefix: prefix, admissionPrefix: prefix, invoicePrefix: prefix, receiptPrefix: prefix,
    resultVerificationRequired: z.boolean(), labImagingMakerCheckerEnforced: z.boolean(), bedTransferRequiresReason: z.boolean(), retentionYears: int(1, 100),
  }).safeParse({
    facilityId: clean(formData.get("facilityId")), timezone: clean(formData.get("timezone")), currency: clean(formData.get("currency")),
    mrnPrefix: clean(formData.get("mrnPrefix")), encounterPrefix: clean(formData.get("encounterPrefix")), appointmentPrefix: clean(formData.get("appointmentPrefix")), admissionPrefix: clean(formData.get("admissionPrefix")), invoicePrefix: clean(formData.get("invoicePrefix")), receiptPrefix: clean(formData.get("receiptPrefix")),
    resultVerificationRequired: formData.get("resultVerificationRequired") === "on", labImagingMakerCheckerEnforced: formData.get("labImagingMakerCheckerEnforced") === "on", bedTransferRequiresReason: formData.get("bedTransferRequiresReason") === "on", retentionYears: clean(formData.get("retentionYears")) ?? "7",
  });
  if (!parsed.success) redirect(`${path}?error=invalid`);
  try { await hospital.upsertHospitalSettings(tenant.organizationId, parsed.data); } catch (error) { handleServiceError(error, path); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}
