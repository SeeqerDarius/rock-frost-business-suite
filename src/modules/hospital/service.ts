import "server-only";

import { Prisma, type HospitalAbnormalFlag, type HospitalAppointmentStatus, type HospitalClaimStatus, type HospitalClinicalNoteType, type HospitalDisposition, type HospitalNursingTaskStatus, type HospitalPaymentMethod, type HospitalReferralStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import { logAuditEvent } from "@/lib/audit";

type Tx = Prisma.TransactionClient;

export class HospitalStateError extends Error {}
export class HospitalNotFoundError extends Error {}

const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

async function nextCode(prefix: string, count: () => Promise<number>) {
  return `${prefix}-${String((await count()) + 1).padStart(6, "0")}`;
}

/** Almost every organization has exactly one facility; numbering falls back to a sane default if settings don't exist yet. */
async function orgDefaultSettings(organizationId: string) {
  return db.hospitalSettings.findFirst({ where: { organizationId }, orderBy: { createdAt: "asc" } });
}

// ---------------------------------------------------------------------
// Facility / department / service / provider / ward / bed configuration
// ---------------------------------------------------------------------

export function listHospitalFacilities(organizationId: string) {
  return db.hospitalFacility.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function createHospitalFacility(organizationId: string, data: { code: string; name: string; address?: string | null; phone?: string | null; email?: string | null; timezone?: string; currency?: string }) {
  return db.hospitalFacility.create({ data: { organizationId, ...data } });
}

export function listHospitalDepartments(organizationId: string) {
  return db.hospitalDepartment.findMany({ where: { organizationId }, include: { facility: true }, orderBy: { name: "asc" } });
}

export async function createHospitalDepartment(organizationId: string, data: { facilityId: string; code: string; name: string }) {
  if (!(await db.hospitalFacility.findFirst({ where: { id: data.facilityId, organizationId } }))) throw new HospitalNotFoundError("Facility not found.");
  return db.hospitalDepartment.create({ data: { organizationId, ...data } });
}

export function listHospitalServiceItems(organizationId: string) {
  return db.hospitalServiceItem.findMany({ where: { organizationId, active: true }, include: { facility: true }, orderBy: { name: "asc" } });
}

export async function createHospitalServiceItem(organizationId: string, data: { facilityId: string; code: string; name: string; category?: string | null; price: Prisma.Decimal.Value }) {
  if (!(await db.hospitalFacility.findFirst({ where: { id: data.facilityId, organizationId } }))) throw new HospitalNotFoundError("Facility not found.");
  return db.hospitalServiceItem.create({ data: { organizationId, ...data, price: money(data.price) } });
}

export function listHospitalProviders(organizationId: string) {
  return db.hospitalProvider.findMany({ where: { organizationId, active: true }, include: { facility: true, department: true }, orderBy: { name: "asc" } });
}

export async function createHospitalProvider(organizationId: string, data: { facilityId: string; departmentId?: string | null; name: string; title?: string | null; specialty?: string | null }) {
  if (!(await db.hospitalFacility.findFirst({ where: { id: data.facilityId, organizationId } }))) throw new HospitalNotFoundError("Facility not found.");
  return db.hospitalProvider.create({ data: { organizationId, ...data } });
}

export function listHospitalWards(organizationId: string) {
  return db.hospitalWard.findMany({ where: { organizationId }, include: { facility: true, beds: true }, orderBy: { name: "asc" } });
}

export async function createHospitalWard(organizationId: string, data: { facilityId: string; code: string; name: string }) {
  if (!(await db.hospitalFacility.findFirst({ where: { id: data.facilityId, organizationId } }))) throw new HospitalNotFoundError("Facility not found.");
  return db.hospitalWard.create({ data: { organizationId, ...data } });
}

export function listHospitalBeds(organizationId: string) {
  return db.hospitalBed.findMany({ where: { organizationId }, include: { ward: { include: { facility: true } } }, orderBy: [{ ward: { name: "asc" } }, { code: "asc" }] });
}

export async function createHospitalBed(organizationId: string, data: { wardId: string; code: string }) {
  if (!(await db.hospitalWard.findFirst({ where: { id: data.wardId, organizationId } }))) throw new HospitalNotFoundError("Ward not found.");
  return db.hospitalBed.create({ data: { organizationId, ...data } });
}

// ---------------------------------------------------------------------
// Patients — organization-unique MRN, advisory duplicate detection
// ---------------------------------------------------------------------

export function listHospitalPatients(organizationId: string) {
  return db.hospitalPatient.findMany({ where: { organizationId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
}

export function getHospitalPatient(organizationId: string, patientId: string) {
  return db.hospitalPatient.findFirst({ where: { id: patientId, organizationId } });
}

/** Advisory only — real patients can legitimately share a name and birth date, so this never blocks registration. */
export function findHospitalPatientDuplicates(organizationId: string, firstName: string, lastName: string, dateOfBirth: Date) {
  return db.hospitalPatient.findMany({ where: { organizationId, firstName: { equals: firstName, mode: "insensitive" }, lastName: { equals: lastName, mode: "insensitive" }, dateOfBirth } });
}

export interface HospitalPatientInput {
  firstName: string; lastName: string; dateOfBirth: Date; sex: string;
  phone?: string | null; email?: string | null; address?: string | null;
  nationalIdType?: string | null; nationalIdNumber?: string | null; bloodGroup?: string | null;
  allergies?: string | null; alerts?: string | null;
  nextOfKinName?: string | null; nextOfKinPhone?: string | null; nextOfKinRelationship?: string | null;
  emergencyContactName?: string | null; emergencyContactPhone?: string | null; emergencyContactRelation?: string | null;
  consentOnFile?: boolean; notes?: string | null;
}

export async function createHospitalPatient(organizationId: string, data: HospitalPatientInput) {
  const prefix = (await orgDefaultSettings(organizationId))?.mrnPrefix ?? "MRN";
  return createWithUniqueRetry(async () => db.hospitalPatient.create({ data: { organizationId, mrn: await nextCode(prefix, () => db.hospitalPatient.count({ where: { organizationId } })), ...data } }));
}

export async function updateHospitalPatient(organizationId: string, patientId: string, data: Partial<HospitalPatientInput>) {
  const existing = await db.hospitalPatient.findFirst({ where: { id: patientId, organizationId } });
  if (!existing) throw new HospitalNotFoundError("Patient not found.");
  return db.hospitalPatient.update({ where: { id: patientId }, data });
}

// ---------------------------------------------------------------------
// Appointments — provider double-booking prevention
// ---------------------------------------------------------------------

export function listHospitalAppointments(organizationId: string) {
  return db.hospitalAppointment.findMany({ where: { organizationId }, include: { facility: true, department: true, provider: true, patient: true, encounter: true }, orderBy: { scheduledStart: "desc" } });
}

async function assertProviderAvailable(tx: Tx, organizationId: string, providerId: string, start: Date, end: Date, excludeAppointmentId?: string) {
  const conflict = await tx.hospitalAppointment.findFirst({ where: { organizationId, providerId, id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined, status: { in: ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"] }, scheduledStart: { lt: end }, scheduledEnd: { gt: start } } });
  if (conflict) throw new HospitalStateError("Provider already has an appointment in that time window.");
}

export async function createHospitalAppointment(organizationId: string, data: { facilityId: string; departmentId?: string | null; providerId: string; patientId: string; scheduledStart: Date; scheduledEnd: Date; reason: string }) {
  if (data.scheduledEnd <= data.scheduledStart) throw new HospitalStateError("End time must be after start time.");
  const [facility, provider, patient] = await Promise.all([
    db.hospitalFacility.findFirst({ where: { id: data.facilityId, organizationId }, include: { settings: true } }),
    db.hospitalProvider.findFirst({ where: { id: data.providerId, organizationId, active: true } }),
    db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }),
  ]);
  if (!facility || !provider || !patient) throw new HospitalNotFoundError("Facility, provider, or patient not found.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hospital-appointment:${organizationId}:${data.providerId}`}))`;
    await assertProviderAvailable(tx, organizationId, data.providerId, data.scheduledStart, data.scheduledEnd);
    return createWithUniqueRetry(async () => tx.hospitalAppointment.create({ data: { organizationId, appointmentNumber: await nextCode(facility.settings?.appointmentPrefix ?? "APT", () => tx.hospitalAppointment.count({ where: { organizationId } })), ...data, status: "SCHEDULED" } }));
  });
}

export async function checkInHospitalAppointment(organizationId: string, appointmentId: string) {
  const appointment = await db.hospitalAppointment.findFirst({ where: { id: appointmentId, organizationId } });
  if (!appointment) throw new HospitalNotFoundError("Appointment not found.");
  if (appointment.status !== "SCHEDULED") throw new HospitalStateError("Only scheduled appointments can check in.");
  return db.hospitalAppointment.update({ where: { id: appointmentId }, data: { status: "CHECKED_IN", checkedInAt: new Date() } });
}

async function endAppointment(organizationId: string, appointmentId: string, status: HospitalAppointmentStatus, cancellationReason?: string | null) {
  const appointment = await db.hospitalAppointment.findFirst({ where: { id: appointmentId, organizationId } });
  if (!appointment) throw new HospitalNotFoundError("Appointment not found.");
  if (!["SCHEDULED", "CHECKED_IN"].includes(appointment.status)) throw new HospitalStateError("Only scheduled or checked-in appointments can be closed this way.");
  return db.hospitalAppointment.update({ where: { id: appointmentId }, data: { status, cancelledAt: status === "CANCELLED" ? new Date() : null, cancellationReason: cancellationReason ?? null } });
}

export function cancelHospitalAppointment(organizationId: string, appointmentId: string, reason: string) {
  return endAppointment(organizationId, appointmentId, "CANCELLED", reason);
}

export function markHospitalAppointmentNoShow(organizationId: string, appointmentId: string) {
  return endAppointment(organizationId, appointmentId, "NO_SHOW");
}

// ---------------------------------------------------------------------
// Encounters — vitals (append-only), clinical notes (immutable once
// signed), diagnoses, care plans (append-only), disposition/close
// ---------------------------------------------------------------------

export function listHospitalEncounters(organizationId: string) {
  return db.hospitalEncounter.findMany({ where: { organizationId }, include: { facility: true, patient: true, provider: true, admission: true }, orderBy: { openedAt: "desc" } });
}

export function getHospitalEncounter(organizationId: string, encounterId: string) {
  return db.hospitalEncounter.findFirst({ where: { id: encounterId, organizationId }, include: { patient: true, provider: true, facility: true, vitals: { orderBy: { recordedAt: "desc" } }, clinicalNotes: { orderBy: { createdAt: "desc" } }, diagnoses: { orderBy: { recordedAt: "desc" } }, carePlans: { orderBy: { createdAt: "desc" } }, admission: { include: { bed: { include: { ward: true } } } } } });
}

export async function createHospitalEncounter(organizationId: string, data: { facilityId: string; patientId: string; providerId: string; appointmentId?: string | null; type: "OUTPATIENT" | "INPATIENT" | "EMERGENCY"; chiefComplaint?: string | null }) {
  const [facility, patient, provider] = await Promise.all([
    db.hospitalFacility.findFirst({ where: { id: data.facilityId, organizationId }, include: { settings: true } }),
    db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }),
    db.hospitalProvider.findFirst({ where: { id: data.providerId, organizationId, active: true } }),
  ]);
  if (!facility || !patient || !provider) throw new HospitalNotFoundError("Facility, patient, or provider not found.");
  if (data.appointmentId && !(await db.hospitalAppointment.findFirst({ where: { id: data.appointmentId, organizationId, patientId: data.patientId } }))) throw new HospitalNotFoundError("Appointment not found for this patient.");
  return createWithUniqueRetry(async () => db.hospitalEncounter.create({ data: { organizationId, encounterNumber: await nextCode(facility.settings?.encounterPrefix ?? "ENC", () => db.hospitalEncounter.count({ where: { organizationId } })), ...data } }));
}

export async function recordHospitalVitals(organizationId: string, encounterId: string, data: { recordedById?: string | null; temperatureC?: Prisma.Decimal.Value | null; pulseBpm?: number | null; respiratoryRate?: number | null; bloodPressureSystolic?: number | null; bloodPressureDiastolic?: number | null; spo2?: number | null; weightKg?: Prisma.Decimal.Value | null; heightCm?: Prisma.Decimal.Value | null; notes?: string | null }) {
  const encounter = await db.hospitalEncounter.findFirst({ where: { id: encounterId, organizationId, status: "OPEN" } });
  if (!encounter) throw new HospitalNotFoundError("Open encounter not found.");
  return db.hospitalVitals.create({ data: { organizationId, encounterId, ...data, temperatureC: data.temperatureC != null ? money(data.temperatureC) : null, weightKg: data.weightKg != null ? money(data.weightKg) : null, heightCm: data.heightCm != null ? money(data.heightCm) : null } });
}

/** Signed notes (signedAt set) are immutable — this only creates new rows, never updates content on a signed note. */
export async function addHospitalClinicalNote(organizationId: string, encounterId: string, data: { authorId?: string | null; type: HospitalClinicalNoteType; content: string; sign?: boolean; correctsNoteId?: string | null }) {
  const encounter = await db.hospitalEncounter.findFirst({ where: { id: encounterId, organizationId } });
  if (!encounter) throw new HospitalNotFoundError("Encounter not found.");
  if (data.correctsNoteId) {
    const original = await db.hospitalClinicalNote.findFirst({ where: { id: data.correctsNoteId, organizationId, encounterId } });
    if (!original) throw new HospitalNotFoundError("Original note not found.");
  }
  const { sign, ...rest } = data;
  return db.hospitalClinicalNote.create({ data: { organizationId, encounterId, ...rest, signedAt: sign ? new Date() : null } });
}

export async function signHospitalClinicalNote(organizationId: string, noteId: string) {
  const note = await db.hospitalClinicalNote.findFirst({ where: { id: noteId, organizationId } });
  if (!note) throw new HospitalNotFoundError("Note not found.");
  if (note.signedAt) throw new HospitalStateError("This note is already signed and cannot be modified. Add an addendum instead.");
  return db.hospitalClinicalNote.update({ where: { id: noteId }, data: { signedAt: new Date() } });
}

export async function addHospitalDiagnosis(organizationId: string, encounterId: string, data: { code?: string | null; description: string; type?: "PRIMARY" | "SECONDARY" }) {
  if (!(await db.hospitalEncounter.findFirst({ where: { id: encounterId, organizationId } }))) throw new HospitalNotFoundError("Encounter not found.");
  return db.hospitalDiagnosis.create({ data: { organizationId, encounterId, ...data } });
}

export async function addHospitalCarePlan(organizationId: string, encounterId: string, data: { goal: string; instructions?: string | null; followUpDate?: Date | null; createdById?: string | null }) {
  if (!(await db.hospitalEncounter.findFirst({ where: { id: encounterId, organizationId } }))) throw new HospitalNotFoundError("Encounter not found.");
  return db.hospitalCarePlan.create({ data: { organizationId, encounterId, ...data } });
}

export async function closeHospitalEncounter(organizationId: string, encounterId: string, disposition: HospitalDisposition) {
  const encounter = await db.hospitalEncounter.findFirst({ where: { id: encounterId, organizationId } });
  if (!encounter) throw new HospitalNotFoundError("Encounter not found.");
  if (encounter.status === "CLOSED") throw new HospitalStateError("Encounter is already closed.");
  if (disposition === "ADMITTED" && !(await db.hospitalAdmission.findFirst({ where: { encounterId, organizationId } }))) throw new HospitalStateError("Admit the patient to a bed before closing with an ADMITTED disposition.");
  return db.hospitalEncounter.update({ where: { id: encounterId }, data: { status: "CLOSED", disposition, closedAt: new Date() } });
}

// ---------------------------------------------------------------------
// Admissions, wards, and beds — transactional double-occupancy prevention
// ---------------------------------------------------------------------

export function listHospitalAdmissions(organizationId: string) {
  return db.hospitalAdmission.findMany({ where: { organizationId }, include: { facility: true, patient: true, bed: { include: { ward: true } }, admittingProvider: true }, orderBy: { admittedAt: "desc" } });
}

export async function admitHospitalPatient(organizationId: string, data: { facilityId: string; patientId: string; encounterId: string; admittingProviderId: string; bedId: string; expectedDischargeDate?: Date | null }) {
  const [facility, patient, encounter, provider, bed] = await Promise.all([
    db.hospitalFacility.findFirst({ where: { id: data.facilityId, organizationId }, include: { settings: true } }),
    db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }),
    db.hospitalEncounter.findFirst({ where: { id: data.encounterId, organizationId, patientId: data.patientId } }),
    db.hospitalProvider.findFirst({ where: { id: data.admittingProviderId, organizationId, active: true } }),
    db.hospitalBed.findFirst({ where: { id: data.bedId, organizationId, active: true } }),
  ]);
  if (!facility || !patient || !encounter || !provider || !bed) throw new HospitalNotFoundError("Facility, patient, encounter, provider, or bed not found.");
  if (await db.hospitalAdmission.findFirst({ where: { encounterId: data.encounterId, organizationId } })) throw new HospitalStateError("This encounter already has an admission.");
  return createWithUniqueRetry(async () => db.$transaction(async (tx) => {
    const claimed = await tx.hospitalBed.updateMany({ where: { id: data.bedId, organizationId, status: "AVAILABLE" }, data: { status: "OCCUPIED" } });
    if (claimed.count !== 1) throw new HospitalStateError("Bed is no longer available.");
    return tx.hospitalAdmission.create({ data: { organizationId, admissionNumber: await nextCode(facility.settings?.admissionPrefix ?? "ADM", () => tx.hospitalAdmission.count({ where: { organizationId } })), facilityId: data.facilityId, patientId: data.patientId, encounterId: data.encounterId, admittingProviderId: data.admittingProviderId, bedId: data.bedId, expectedDischargeDate: data.expectedDischargeDate } });
  }));
}

export async function transferHospitalBed(organizationId: string, admissionId: string, toBedId: string, reason?: string | null) {
  const admission = await db.hospitalAdmission.findFirst({ where: { id: admissionId, organizationId, status: "ADMITTED" } });
  if (!admission) throw new HospitalNotFoundError("Active admission not found.");
  if (toBedId === admission.bedId) throw new HospitalStateError("Patient is already in that bed.");
  const targetBed = await db.hospitalBed.findFirst({ where: { id: toBedId, organizationId, active: true } });
  if (!targetBed) throw new HospitalNotFoundError("Target bed not found.");
  return db.$transaction(async (tx) => {
    const claimed = await tx.hospitalBed.updateMany({ where: { id: toBedId, organizationId, status: "AVAILABLE" }, data: { status: "OCCUPIED" } });
    if (claimed.count !== 1) throw new HospitalStateError("Target bed is no longer available.");
    await tx.hospitalBed.update({ where: { id: admission.bedId }, data: { status: "CLEANING" } });
    await tx.hospitalBedTransfer.create({ data: { organizationId, admissionId, fromBedId: admission.bedId, toBedId, reason } });
    return tx.hospitalAdmission.update({ where: { id: admissionId }, data: { bedId: toBedId } });
  });
}

export async function dischargeHospitalPatient(organizationId: string, admissionId: string, dischargeSummary?: string | null) {
  const admission = await db.hospitalAdmission.findFirst({ where: { id: admissionId, organizationId, status: "ADMITTED" } });
  if (!admission) throw new HospitalNotFoundError("Active admission not found.");
  return db.$transaction(async (tx) => {
    await tx.hospitalBed.update({ where: { id: admission.bedId }, data: { status: "CLEANING" } });
    await tx.hospitalEncounter.updateMany({ where: { id: admission.encounterId, organizationId, status: "OPEN" }, data: { status: "CLOSED", disposition: "DISCHARGED_HOME", closedAt: new Date() } });
    return tx.hospitalAdmission.update({ where: { id: admissionId }, data: { status: "DISCHARGED", dischargedAt: new Date(), dischargeSummary } });
  });
}

// ---------------------------------------------------------------------
// Laboratory — orders, specimens, immutable verified results with
// append-only corrections via supersession
// ---------------------------------------------------------------------

export function listHospitalLabTests(organizationId: string) {
  return db.hospitalLabTest.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } });
}

export function createHospitalLabTest(organizationId: string, data: { code: string; name: string; specimenType?: string | null; price: Prisma.Decimal.Value }) {
  return db.hospitalLabTest.create({ data: { organizationId, ...data, price: money(data.price) } });
}

export function listHospitalLabOrders(organizationId: string) {
  return db.hospitalLabOrder.findMany({ where: { organizationId }, include: { patient: true, encounter: true, items: { include: { labTest: true, results: { orderBy: { enteredAt: "desc" } } } } }, orderBy: { orderedAt: "desc" } });
}

export async function createHospitalLabOrder(organizationId: string, data: { encounterId: string; patientId: string; orderedById?: string | null; testIds: string[] }) {
  const [encounter, patient, tests] = await Promise.all([
    db.hospitalEncounter.findFirst({ where: { id: data.encounterId, organizationId, patientId: data.patientId } }),
    db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }),
    db.hospitalLabTest.findMany({ where: { id: { in: data.testIds }, organizationId, active: true } }),
  ]);
  if (!encounter || !patient) throw new HospitalNotFoundError("Encounter or patient not found.");
  if (tests.length === 0 || tests.length !== new Set(data.testIds).size) throw new HospitalNotFoundError("One or more lab tests not found.");
  return db.hospitalLabOrder.create({ data: { organizationId, encounterId: data.encounterId, patientId: data.patientId, orderedById: data.orderedById, items: { create: tests.map((test) => ({ organizationId, labTestId: test.id })) } }, include: { items: true } });
}

/** Reads the org's lab/imaging maker-checker toggle, defaulting to enforced when no settings row exists yet. */
async function isMakerCheckerEnforced(organizationId: string) {
  const settings = await orgDefaultSettings(organizationId);
  return settings?.labImagingMakerCheckerEnforced ?? true;
}

export async function collectHospitalLabSpecimen(organizationId: string, itemId: string) {
  const item = await db.hospitalLabOrderItem.findFirst({ where: { id: itemId, organizationId, status: "ORDERED" } });
  if (!item) throw new HospitalNotFoundError("Ordered lab item not found.");
  return db.$transaction(async (tx) => {
    const updated = await tx.hospitalLabOrderItem.update({ where: { id: itemId }, data: { status: "SPECIMEN_COLLECTED", specimenCollectedAt: new Date() } });
    await tx.hospitalLabOrder.update({ where: { id: item.labOrderId }, data: { status: "SPECIMEN_COLLECTED" } });
    return updated;
  });
}

export async function enterHospitalLabResult(organizationId: string, itemId: string, data: { value: string; unit?: string | null; referenceRange?: string | null; abnormalFlag?: HospitalAbnormalFlag; enteredById?: string | null }) {
  const item = await db.hospitalLabOrderItem.findFirst({ where: { id: itemId, organizationId } });
  if (!item) throw new HospitalNotFoundError("Lab order item not found.");
  if (item.status === "VERIFIED") throw new HospitalStateError("This result is already verified. Enter a correction instead.");
  return db.$transaction(async (tx) => {
    const result = await tx.hospitalLabResult.create({ data: { organizationId, labOrderItemId: itemId, ...data } });
    await tx.hospitalLabOrderItem.update({ where: { id: itemId }, data: { status: "RESULTED" } });
    await logAuditEvent({ organizationId, userId: data.enteredById, module: "hospital", action: "lab_result.entered", entityName: "HospitalLabResult", entityId: result.id, metadata: { labOrderItemId: itemId, abnormalFlag: result.abnormalFlag } }, tx);
    return result;
  });
}

export async function verifyHospitalLabResult(organizationId: string, resultId: string, verifiedById?: string | null) {
  const result = await db.hospitalLabResult.findFirst({ where: { id: resultId, organizationId } });
  if (!result) throw new HospitalNotFoundError("Result not found.");
  if (result.verifiedAt) throw new HospitalStateError("Result is already verified.");
  if (result.rejectedAt) throw new HospitalStateError("A rejected result cannot be verified. Enter a fresh result instead.");
  if ((await isMakerCheckerEnforced(organizationId)) && result.enteredById && verifiedById && result.enteredById === verifiedById) {
    throw new HospitalStateError("The person who entered this result cannot also verify it.");
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.hospitalLabResult.updateMany({ where: { id: resultId, organizationId, verifiedAt: null, rejectedAt: null }, data: { verifiedAt: new Date(), verifiedById } });
    if (!updated.count) throw new HospitalStateError("Result is already verified or rejected.");
    const verified = await tx.hospitalLabResult.findUniqueOrThrow({ where: { id: resultId } });
    await tx.hospitalLabOrderItem.update({ where: { id: result.labOrderItemId }, data: { status: "VERIFIED" } });
    await logAuditEvent({ organizationId, userId: verifiedById, module: "hospital", action: "lab_result.verified", entityName: "HospitalLabResult", entityId: resultId }, tx);
    return verified;
  });
}

/** A verifier declines an unverified result — the item reopens for a fresh entry, nothing is deleted. */
export async function rejectHospitalLabResult(organizationId: string, resultId: string, rejectedById: string | null, reason: string) {
  if (!reason.trim()) throw new HospitalStateError("A rejection reason is required.");
  const result = await db.hospitalLabResult.findFirst({ where: { id: resultId, organizationId } });
  if (!result) throw new HospitalNotFoundError("Result not found.");
  if (result.verifiedAt) throw new HospitalStateError("A verified result cannot be rejected. Correct it instead.");
  if (result.rejectedAt) throw new HospitalStateError("Result is already rejected.");
  return db.$transaction(async (tx) => {
    const updated = await tx.hospitalLabResult.updateMany({ where: { id: resultId, organizationId, verifiedAt: null, rejectedAt: null }, data: { rejectedAt: new Date(), rejectedById, rejectionReason: reason } });
    if (!updated.count) throw new HospitalStateError("Result is already verified or rejected.");
    const rejected = await tx.hospitalLabResult.findUniqueOrThrow({ where: { id: resultId } });
    await tx.hospitalLabOrderItem.update({ where: { id: result.labOrderItemId }, data: { status: "SPECIMEN_COLLECTED" } });
    await logAuditEvent({ organizationId, userId: rejectedById, module: "hospital", action: "lab_result.rejected", entityName: "HospitalLabResult", entityId: resultId, metadata: { reason } }, tx);
    return rejected;
  });
}

/** Never edits a verified result — always inserts a new row that supersedes it, preserving the full history. */
export async function correctHospitalLabResult(organizationId: string, priorResultId: string, data: { value: string; unit?: string | null; referenceRange?: string | null; abnormalFlag?: HospitalAbnormalFlag; enteredById?: string | null; correctionReason: string }) {
  const prior = await db.hospitalLabResult.findFirst({ where: { id: priorResultId, organizationId } });
  if (!prior) throw new HospitalNotFoundError("Result not found.");
  if (!prior.verifiedAt) throw new HospitalStateError("Only a verified result can be corrected. Edit the unverified result directly instead.");
  return db.$transaction(async (tx) => {
    const corrected = await tx.hospitalLabResult.create({ data: { organizationId, labOrderItemId: prior.labOrderItemId, supersedesResultId: prior.id, ...data } });
    await logAuditEvent({ organizationId, userId: data.enteredById, module: "hospital", action: "lab_result.corrected", entityName: "HospitalLabResult", entityId: corrected.id, metadata: { supersedesResultId: prior.id, correctionReason: data.correctionReason } }, tx);
    return corrected;
  });
}

// ---------------------------------------------------------------------
// Imaging — same order/verify/correct-by-supersession pattern as lab;
// externalAccessionNumber/externalSystemReference are the PACS boundary
// ---------------------------------------------------------------------

export function listHospitalImagingTests(organizationId: string) {
  return db.hospitalImagingTest.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } });
}

export function createHospitalImagingTest(organizationId: string, data: { code: string; name: string; modality: string; price: Prisma.Decimal.Value }) {
  return db.hospitalImagingTest.create({ data: { organizationId, ...data, price: money(data.price) } });
}

export function listHospitalImagingOrders(organizationId: string) {
  return db.hospitalImagingOrder.findMany({ where: { organizationId }, include: { patient: true, encounter: true, imagingTest: true, findings: { orderBy: { enteredAt: "desc" } } }, orderBy: { orderedAt: "desc" } });
}

export async function createHospitalImagingOrder(organizationId: string, data: { encounterId: string; patientId: string; imagingTestId: string; orderedById?: string | null }) {
  const [encounter, patient, test] = await Promise.all([
    db.hospitalEncounter.findFirst({ where: { id: data.encounterId, organizationId, patientId: data.patientId } }),
    db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }),
    db.hospitalImagingTest.findFirst({ where: { id: data.imagingTestId, organizationId, active: true } }),
  ]);
  if (!encounter || !patient || !test) throw new HospitalNotFoundError("Encounter, patient, or imaging test not found.");
  return db.hospitalImagingOrder.create({ data: { organizationId, ...data } });
}

export async function scheduleHospitalImagingOrder(organizationId: string, orderId: string, scheduledAt: Date, externalAccessionNumber?: string | null, externalSystemReference?: string | null) {
  const order = await db.hospitalImagingOrder.findFirst({ where: { id: orderId, organizationId } });
  if (!order) throw new HospitalNotFoundError("Imaging order not found.");
  if (!["ORDERED", "SCHEDULED"].includes(order.status)) throw new HospitalStateError("Only an ordered or scheduled imaging order can be rescheduled.");
  return db.hospitalImagingOrder.update({ where: { id: orderId }, data: { status: "SCHEDULED", scheduledAt, externalAccessionNumber, externalSystemReference } });
}

export async function enterHospitalImagingFinding(organizationId: string, orderId: string, data: { findings: string; impression?: string | null; enteredById?: string | null }) {
  const order = await db.hospitalImagingOrder.findFirst({ where: { id: orderId, organizationId }, include: { findings: true } });
  if (!order) throw new HospitalNotFoundError("Imaging order not found.");
  const current = order.findings.find((finding) => !order.findings.some((other) => other.supersedesFindingId === finding.id));
  if (current?.verifiedAt) throw new HospitalStateError("This finding is already verified. Enter a correction instead.");
  return db.$transaction(async (tx) => {
    const finding = await tx.hospitalImagingFinding.create({ data: { organizationId, imagingOrderId: orderId, ...data } });
    await tx.hospitalImagingOrder.update({ where: { id: orderId }, data: { status: "COMPLETED" } });
    await logAuditEvent({ organizationId, userId: data.enteredById, module: "hospital", action: "imaging_finding.entered", entityName: "HospitalImagingFinding", entityId: finding.id, metadata: { imagingOrderId: orderId } }, tx);
    return finding;
  });
}

export async function verifyHospitalImagingFinding(organizationId: string, findingId: string, verifiedById?: string | null) {
  const finding = await db.hospitalImagingFinding.findFirst({ where: { id: findingId, organizationId } });
  if (!finding) throw new HospitalNotFoundError("Finding not found.");
  if (finding.verifiedAt) throw new HospitalStateError("Finding is already verified.");
  if (finding.rejectedAt) throw new HospitalStateError("A rejected finding cannot be verified. Enter a fresh finding instead.");
  if ((await isMakerCheckerEnforced(organizationId)) && finding.enteredById && verifiedById && finding.enteredById === verifiedById) {
    throw new HospitalStateError("The person who entered this finding cannot also verify it.");
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.hospitalImagingFinding.updateMany({ where: { id: findingId, organizationId, verifiedAt: null, rejectedAt: null }, data: { verifiedAt: new Date(), verifiedById } });
    if (!updated.count) throw new HospitalStateError("Finding is already verified or rejected.");
    const verified = await tx.hospitalImagingFinding.findUniqueOrThrow({ where: { id: findingId } });
    await logAuditEvent({ organizationId, userId: verifiedById, module: "hospital", action: "imaging_finding.verified", entityName: "HospitalImagingFinding", entityId: findingId }, tx);
    return verified;
  });
}

/** A verifier declines an unverified finding — a fresh enterHospitalImagingFinding call is then allowed for the order. */
export async function rejectHospitalImagingFinding(organizationId: string, findingId: string, rejectedById: string | null, reason: string) {
  if (!reason.trim()) throw new HospitalStateError("A rejection reason is required.");
  const finding = await db.hospitalImagingFinding.findFirst({ where: { id: findingId, organizationId } });
  if (!finding) throw new HospitalNotFoundError("Finding not found.");
  if (finding.verifiedAt) throw new HospitalStateError("A verified finding cannot be rejected. Correct it instead.");
  if (finding.rejectedAt) throw new HospitalStateError("Finding is already rejected.");
  return db.$transaction(async (tx) => {
    const updated = await tx.hospitalImagingFinding.updateMany({ where: { id: findingId, organizationId, verifiedAt: null, rejectedAt: null }, data: { rejectedAt: new Date(), rejectedById, rejectionReason: reason } });
    if (!updated.count) throw new HospitalStateError("Finding is already verified or rejected.");
    const rejected = await tx.hospitalImagingFinding.findUniqueOrThrow({ where: { id: findingId } });
    await logAuditEvent({ organizationId, userId: rejectedById, module: "hospital", action: "imaging_finding.rejected", entityName: "HospitalImagingFinding", entityId: findingId, metadata: { reason } }, tx);
    return rejected;
  });
}

export async function correctHospitalImagingFinding(organizationId: string, priorFindingId: string, data: { findings: string; impression?: string | null; enteredById?: string | null; correctionReason: string }) {
  const prior = await db.hospitalImagingFinding.findFirst({ where: { id: priorFindingId, organizationId } });
  if (!prior) throw new HospitalNotFoundError("Finding not found.");
  if (!prior.verifiedAt) throw new HospitalStateError("Only a verified finding can be corrected. Edit the unverified finding directly instead.");
  return db.$transaction(async (tx) => {
    const corrected = await tx.hospitalImagingFinding.create({ data: { organizationId, imagingOrderId: prior.imagingOrderId, supersedesFindingId: prior.id, ...data } });
    await logAuditEvent({ organizationId, userId: data.enteredById, module: "hospital", action: "imaging_finding.corrected", entityName: "HospitalImagingFinding", entityId: corrected.id, metadata: { supersedesFindingId: prior.id, correctionReason: data.correctionReason } }, tx);
    return corrected;
  });
}

// ---------------------------------------------------------------------
// Medication orders — Hospital-owned versioned contract. Never touches a
// Pharmacy table; externalDispenseReference is an opaque string boundary.
// ---------------------------------------------------------------------

export function listHospitalMedicationOrders(organizationId: string) {
  return db.hospitalMedicationOrder.findMany({ where: { organizationId }, include: { patient: true, encounter: true }, orderBy: { orderedAt: "desc" } });
}

export async function createHospitalMedicationOrder(organizationId: string, data: { encounterId: string; patientId: string; orderedById?: string | null; medicationName: string; strength?: string | null; route?: string | null; dose: string; frequency: string; durationDays?: number | null; instructions?: string | null }) {
  const [encounter, patient] = await Promise.all([
    db.hospitalEncounter.findFirst({ where: { id: data.encounterId, organizationId, patientId: data.patientId } }),
    db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }),
  ]);
  if (!encounter || !patient) throw new HospitalNotFoundError("Encounter or patient not found.");
  return db.hospitalMedicationOrder.create({ data: { organizationId, ...data } });
}

export async function markHospitalMedicationSentToPharmacy(organizationId: string, orderId: string, externalDispenseReference?: string | null) {
  const order = await db.hospitalMedicationOrder.findFirst({ where: { id: orderId, organizationId, status: "ORDERED" } });
  if (!order) throw new HospitalNotFoundError("Ordered medication order not found.");
  return db.hospitalMedicationOrder.update({ where: { id: orderId }, data: { status: "SENT_TO_PHARMACY", externalDispenseReference } });
}

export async function cancelHospitalMedicationOrder(organizationId: string, orderId: string, reason: string) {
  const order = await db.hospitalMedicationOrder.findFirst({ where: { id: orderId, organizationId } });
  if (!order) throw new HospitalNotFoundError("Medication order not found.");
  if (["DISPENSED", "CANCELLED", "COMPLETED"].includes(order.status)) throw new HospitalStateError("This medication order can no longer be cancelled.");
  return db.hospitalMedicationOrder.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason } });
}

// ---------------------------------------------------------------------
// Billing — Decimal money throughout, transactional payment application
// ---------------------------------------------------------------------

export function listHospitalInvoices(organizationId: string) {
  return db.hospitalInvoice.findMany({ where: { organizationId }, include: { facility: true, patient: true, lines: true, payments: true, insuranceClaims: true }, orderBy: { issuedAt: "desc" } });
}

export async function createHospitalInvoice(organizationId: string, data: { facilityId: string; patientId: string; encounterId?: string | null; lines: { description: string; serviceItemId?: string | null; quantity: number; unitPrice: Prisma.Decimal.Value }[] }) {
  const [facility, patient] = await Promise.all([
    db.hospitalFacility.findFirst({ where: { id: data.facilityId, organizationId }, include: { settings: true } }),
    db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }),
  ]);
  if (!facility || !patient) throw new HospitalNotFoundError("Facility or patient not found.");
  if (data.lines.length === 0) throw new HospitalStateError("An invoice needs at least one line.");
  const lines = data.lines.map((line) => ({ ...line, unitPrice: money(line.unitPrice), lineTotal: money(line.unitPrice).mul(line.quantity) }));
  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
  return createWithUniqueRetry(async () => db.hospitalInvoice.create({
    data: {
      organizationId, facilityId: data.facilityId, patientId: data.patientId, encounterId: data.encounterId,
      invoiceNumber: await nextCode(facility.settings?.invoicePrefix ?? "INV", () => db.hospitalInvoice.count({ where: { organizationId } })),
      subtotal, total: subtotal,
      lines: { create: lines.map((line) => ({ organizationId, description: line.description, serviceItemId: line.serviceItemId, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal })) },
    },
    include: { lines: true },
  }));
}

export async function getHospitalInvoiceBalance(organizationId: string, invoiceId: string) {
  const invoice = await db.hospitalInvoice.findFirst({ where: { id: invoiceId, organizationId }, include: { payments: true } });
  if (!invoice) throw new HospitalNotFoundError("Invoice not found.");
  const paid = invoice.payments.filter((payment) => !payment.refundedAt).reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
  return { invoice, paid, balance: invoice.total.minus(paid) };
}

/** Runs inside a transaction so concurrent payments against the same invoice can never both apply against a stale balance. */
export async function recordHospitalPayment(organizationId: string, invoiceId: string, data: { amount: Prisma.Decimal.Value; method: HospitalPaymentMethod; reference?: string | null; receivedById?: string | null }) {
  const amount = money(data.amount);
  if (amount.lte(0)) throw new HospitalStateError("Payment must be greater than zero.");
  return createWithUniqueRetry(async () => db.$transaction(async (tx) => {
    const invoice = await tx.hospitalInvoice.findFirst({ where: { id: invoiceId, organizationId, voidedAt: null }, include: { payments: true, facility: { include: { settings: true } } } });
    if (!invoice) throw new HospitalNotFoundError("Open invoice not found.");
    const alreadyPaid = invoice.payments.filter((payment) => !payment.refundedAt).reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
    const newBalance = invoice.total.minus(alreadyPaid).minus(amount);
    if (newBalance.lt(0)) throw new HospitalStateError("Payment exceeds the outstanding balance.");
    const payment = await tx.hospitalPayment.create({ data: { organizationId, invoiceId, receiptNumber: await nextCode(invoice.facility.settings?.receiptPrefix ?? "RCT", () => tx.hospitalPayment.count({ where: { organizationId } })), amount, method: data.method, reference: data.reference, receivedById: data.receivedById } });
    await tx.hospitalInvoice.update({ where: { id: invoiceId }, data: { status: newBalance.eq(0) ? "PAID" : "PARTIALLY_PAID" } });
    return payment;
  }));
}

export async function voidHospitalInvoice(organizationId: string, invoiceId: string, reason: string) {
  const invoice = await db.hospitalInvoice.findFirst({ where: { id: invoiceId, organizationId }, include: { payments: true } });
  if (!invoice) throw new HospitalNotFoundError("Invoice not found.");
  if (invoice.voidedAt) throw new HospitalStateError("Invoice is already void.");
  if (invoice.payments.some((payment) => !payment.refundedAt)) throw new HospitalStateError("An invoice with unrefunded payments cannot be voided.");
  return db.hospitalInvoice.update({ where: { id: invoiceId }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason } });
}

export function listHospitalInsuranceClaims(organizationId: string) {
  return db.hospitalInsuranceClaim.findMany({ where: { organizationId }, include: { invoice: true, patient: true }, orderBy: { submittedAt: "desc" } });
}

export async function createHospitalInsuranceClaim(organizationId: string, data: { invoiceId: string; patientId: string; insurerName: string; policyNumber: string; claimNumber?: string | null }) {
  const [invoice, patient] = await Promise.all([
    db.hospitalInvoice.findFirst({ where: { id: data.invoiceId, organizationId } }),
    db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }),
  ]);
  if (!invoice || !patient) throw new HospitalNotFoundError("Invoice or patient not found.");
  return db.hospitalInsuranceClaim.create({ data: { organizationId, ...data } });
}

export async function updateHospitalInsuranceClaimStatus(organizationId: string, claimId: string, status: HospitalClaimStatus, approvedAmount?: Prisma.Decimal.Value | null, notes?: string | null) {
  const claim = await db.hospitalInsuranceClaim.findFirst({ where: { id: claimId, organizationId } });
  if (!claim) throw new HospitalNotFoundError("Claim not found.");
  return db.hospitalInsuranceClaim.update({ where: { id: claimId }, data: { status, approvedAmount: approvedAmount != null ? money(approvedAmount) : undefined, notes } });
}

// ---------------------------------------------------------------------
// Nursing tasks, clinical alerts, referrals, consent, attachments
// ---------------------------------------------------------------------

export function listHospitalNursingTasks(organizationId: string) {
  return db.hospitalNursingTask.findMany({ where: { organizationId }, include: { patient: true, encounter: true }, orderBy: [{ status: "asc" }, { dueAt: "asc" }] });
}

export async function createHospitalNursingTask(organizationId: string, data: { patientId: string; encounterId?: string | null; description: string; dueAt?: Date | null; assignedToId?: string | null; createdById?: string | null }) {
  if (!(await db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }))) throw new HospitalNotFoundError("Patient not found.");
  return db.hospitalNursingTask.create({ data: { organizationId, ...data } });
}

export async function updateHospitalNursingTaskStatus(organizationId: string, taskId: string, status: HospitalNursingTaskStatus, completedById?: string | null) {
  const task = await db.hospitalNursingTask.findFirst({ where: { id: taskId, organizationId } });
  if (!task) throw new HospitalNotFoundError("Nursing task not found.");
  return db.hospitalNursingTask.update({ where: { id: taskId }, data: { status, completedAt: status === "COMPLETED" ? new Date() : null, completedById: status === "COMPLETED" ? completedById : null } });
}

export function listHospitalClinicalAlerts(organizationId: string) {
  return db.hospitalClinicalAlert.findMany({ where: { organizationId, active: true }, include: { patient: true }, orderBy: { createdAt: "desc" } });
}

export async function createHospitalClinicalAlert(organizationId: string, data: { patientId: string; type: string; description: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; createdById?: string | null }) {
  if (!(await db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }))) throw new HospitalNotFoundError("Patient not found.");
  return db.hospitalClinicalAlert.create({ data: { organizationId, ...data } });
}

export async function resolveHospitalClinicalAlert(organizationId: string, alertId: string) {
  const alert = await db.hospitalClinicalAlert.findFirst({ where: { id: alertId, organizationId, active: true } });
  if (!alert) throw new HospitalNotFoundError("Active alert not found.");
  return db.hospitalClinicalAlert.update({ where: { id: alertId }, data: { active: false, resolvedAt: new Date() } });
}

export function listHospitalReferrals(organizationId: string) {
  return db.hospitalReferral.findMany({ where: { organizationId }, include: { patient: true, encounter: true }, orderBy: { createdAt: "desc" } });
}

export async function createHospitalReferral(organizationId: string, data: { encounterId: string; patientId: string; referredById?: string | null; referredToFacility: string; reason: string }) {
  if (!(await db.hospitalEncounter.findFirst({ where: { id: data.encounterId, organizationId, patientId: data.patientId } }))) throw new HospitalNotFoundError("Encounter not found for this patient.");
  return db.hospitalReferral.create({ data: { organizationId, ...data } });
}

export async function updateHospitalReferralStatus(organizationId: string, referralId: string, status: HospitalReferralStatus) {
  const referral = await db.hospitalReferral.findFirst({ where: { id: referralId, organizationId } });
  if (!referral) throw new HospitalNotFoundError("Referral not found.");
  return db.hospitalReferral.update({ where: { id: referralId }, data: { status } });
}

export function listHospitalConsents(organizationId: string, patientId?: string) {
  return db.hospitalConsent.findMany({ where: { organizationId, patientId }, orderBy: { consentedAt: "desc" } });
}

export async function createHospitalConsent(organizationId: string, data: { patientId: string; type: "TREATMENT" | "PROCEDURE" | "DATA_SHARING" | "OTHER"; description: string; consentedByName: string; witnessedById?: string | null; documentReference?: string | null }) {
  if (!(await db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }))) throw new HospitalNotFoundError("Patient not found.");
  return db.hospitalConsent.create({ data: { organizationId, ...data } });
}

export async function revokeHospitalConsent(organizationId: string, consentId: string) {
  const consent = await db.hospitalConsent.findFirst({ where: { id: consentId, organizationId, revokedAt: null } });
  if (!consent) throw new HospitalNotFoundError("Active consent not found.");
  return db.hospitalConsent.update({ where: { id: consentId }, data: { revokedAt: new Date() } });
}

export function listHospitalAttachments(organizationId: string, patientId?: string) {
  return db.hospitalAttachment.findMany({ where: { organizationId, patientId }, orderBy: { uploadedAt: "desc" } });
}

export async function createHospitalAttachment(organizationId: string, data: { patientId?: string | null; encounterId?: string | null; category: "LAB_EXTERNAL" | "IMAGING_EXTERNAL" | "DOCUMENT" | "OTHER"; fileName: string; externalReference: string; description?: string | null; uploadedById?: string | null }) {
  if (data.patientId && !(await db.hospitalPatient.findFirst({ where: { id: data.patientId, organizationId } }))) throw new HospitalNotFoundError("Patient not found.");
  if (data.encounterId && !(await db.hospitalEncounter.findFirst({ where: { id: data.encounterId, organizationId } }))) throw new HospitalNotFoundError("Encounter not found.");
  return db.hospitalAttachment.create({ data: { organizationId, ...data } });
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

export function listHospitalSettings(organizationId: string) {
  return db.hospitalFacility.findMany({ where: { organizationId }, include: { settings: true }, orderBy: { name: "asc" } });
}

export interface HospitalSettingsInput {
  facilityId: string; timezone: string; currency: string;
  mrnPrefix: string; encounterPrefix: string; appointmentPrefix: string; admissionPrefix: string; invoicePrefix: string; receiptPrefix: string;
  resultVerificationRequired: boolean; labImagingMakerCheckerEnforced: boolean; bedTransferRequiresReason: boolean; retentionYears: number;
}

export async function upsertHospitalSettings(organizationId: string, data: HospitalSettingsInput) {
  const facility = await db.hospitalFacility.findFirst({ where: { id: data.facilityId, organizationId } });
  if (!facility) throw new HospitalNotFoundError("Facility not found.");
  const { facilityId, timezone, currency, ...settings } = data;
  return db.$transaction(async (tx) => {
    await tx.hospitalFacility.update({ where: { id: facilityId }, data: { timezone, currency } });
    return tx.hospitalSettings.upsert({ where: { facilityId }, update: settings, create: { organizationId, facilityId, ...settings } });
  });
}

// ---------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------

export async function getHospitalSummary(organizationId: string) {
  const [patients, todaysAppointments, openEncounters, admittedCount, beds, pendingLabItems, outstandingInvoices, activeAlerts] = await Promise.all([
    db.hospitalPatient.count({ where: { organizationId, status: "ACTIVE" } }),
    db.hospitalAppointment.count({ where: { organizationId, status: { in: ["SCHEDULED", "CHECKED_IN"] }, scheduledStart: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, scheduledEnd: { lte: new Date(new Date().setHours(23, 59, 59, 999)) } } }),
    db.hospitalEncounter.count({ where: { organizationId, status: "OPEN" } }),
    db.hospitalAdmission.count({ where: { organizationId, status: "ADMITTED" } }),
    db.hospitalBed.findMany({ where: { organizationId, active: true } }),
    db.hospitalLabOrderItem.count({ where: { organizationId, status: { in: ["ORDERED", "SPECIMEN_COLLECTED", "IN_PROGRESS", "RESULTED"] } } }),
    db.hospitalInvoice.findMany({ where: { organizationId, status: { in: ["OPEN", "PARTIALLY_PAID"] } }, include: { payments: true } }),
    db.hospitalClinicalAlert.count({ where: { organizationId, active: true } }),
  ]);
  const outstandingTotal = outstandingInvoices.reduce((total, invoice) => total.plus(invoice.total.minus(invoice.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0)))), new Prisma.Decimal(0));
  return {
    activePatients: patients,
    todaysAppointments,
    openEncounters,
    admittedCount,
    totalBeds: beds.length,
    occupiedBeds: beds.filter((bed) => bed.status === "OCCUPIED").length,
    pendingLabItems,
    outstandingTotal,
    activeAlerts,
  };
}
