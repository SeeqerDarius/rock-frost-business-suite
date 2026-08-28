import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, PharmacyBatchStatus, PharmacyMedicineClass, PharmacyStockMovementType } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { sendSms } from "@/lib/sms";
import { pharmacyPickupReadySms } from "@/lib/sms-templates";

type Tx = Prisma.TransactionClient;
export class PharmacyNotFoundError extends Error {}
export class PharmacyStockError extends Error {}
export class PharmacyPrescriptionRequiredError extends Error {}
/** Same-actor maker-checker violation, or an action attempted against the wrong workflow state. */
export class PharmacyWorkflowError extends Error {}

type PendingDispenseLine = { medicineId: string; quantity: number; prescriptionLineId?: string | null };

export function listMedicines(organizationId: string) {
  return db.pharmacyMedicine.findMany({ where: { organizationId }, include: { batches: true }, orderBy: { name: "asc" } });
}

/** Tenant-scoped barcode lookup — never accepts an organizationId from anywhere but the authenticated caller. */
export function findMedicineByBarcode(organizationId: string, barcode: string) {
  return db.pharmacyMedicine.findFirst({ where: { organizationId, barcode, active: true } });
}

/** Tenant-scoped batch barcode lookup (e.g. a GS1 lot/batch code scanned at receiving or dispensing). */
export function findBatchByBarcode(organizationId: string, barcode: string) {
  return db.pharmacyBatch.findFirst({ where: { organizationId, barcode }, include: { medicine: true, supplier: true } });
}

export async function createMedicine(organizationId: string, data: {
  sku: string; name: string; genericName?: string | null; strength?: string | null; dosageForm?: string | null;
  unit: string; medicineClass: PharmacyMedicineClass; registrationNumber?: string | null; barcode?: string | null;
  sellingPrice: string; reorderPoint: number; requiresPrescription: boolean;
}) {
  try {
    return await db.pharmacyMedicine.create({ data: { organizationId, ...data } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PharmacyStockError("A medicine with this SKU or barcode already exists.");
    }
    throw error;
  }
}

export function listSuppliers(organizationId: string) {
  return db.pharmacySupplier.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } });
}

export function createSupplier(organizationId: string, data: { name: string; licenceNumber?: string | null; contactPerson?: string | null; phone?: string | null; email?: string | null; address?: string | null }) {
  return db.pharmacySupplier.create({ data: { organizationId, ...data } });
}

export function listBatches(organizationId: string) {
  return db.pharmacyBatch.findMany({ where: { organizationId }, include: { medicine: true, supplier: true }, orderBy: [{ expiryDate: "asc" }, { receivedAt: "desc" }] });
}

export async function receiveBatch(organizationId: string, actorId: string, data: {
  medicineId: string; supplierId?: string | null; batchNumber: string; quantity: number; costPrice: string;
  manufactureDate?: Date | null; expiryDate: Date; invoiceReference?: string | null; barcode?: string | null;
}) {
  if (!Number.isInteger(data.quantity) || data.quantity <= 0 || data.expiryDate <= new Date()) throw new PharmacyStockError("Batch quantity and expiry are invalid.");
  const [medicine, supplier] = await Promise.all([
    db.pharmacyMedicine.findFirst({ where: { id: data.medicineId, organizationId, active: true } }),
    data.supplierId ? db.pharmacySupplier.findFirst({ where: { id: data.supplierId, organizationId, active: true } }) : null,
  ]);
  if (!medicine || (data.supplierId && !supplier)) throw new PharmacyNotFoundError("Medicine or supplier not found.");
  try {
    return await db.$transaction(async (tx) => {
      const batch = await tx.pharmacyBatch.create({ data: { organizationId, ...data, initialQuantity: data.quantity } });
      await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "batch.received", entityName: "PharmacyBatch", entityId: batch.id, metadata: { medicineId: medicine.id, batchNumber: batch.batchNumber, quantity: batch.quantity } }, tx);
      return batch;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PharmacyStockError("A batch with this batch number or barcode already exists.");
    }
    throw error;
  }
}

export async function updateBatchStatus(organizationId: string, actorId: string, batchId: string, status: PharmacyBatchStatus, reason: string) {
  if (!reason.trim()) throw new PharmacyStockError("A reason is required for every batch status change.");
  return db.$transaction(async (tx) => {
    const batch = await tx.pharmacyBatch.findFirst({ where: { id: batchId, organizationId }, include: { medicine: true } });
    if (!batch) throw new PharmacyNotFoundError("Batch not found.");
    if (status === "AVAILABLE" && (batch.quantity <= 0 || batch.expiryDate <= new Date())) throw new PharmacyStockError("An empty or expired batch cannot be released for dispensing.");
    const updated = await tx.pharmacyBatch.update({ where: { id: batch.id }, data: { status } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "batch.status_changed", entityName: "PharmacyBatch", entityId: batch.id, metadata: { medicine: batch.medicine.name, batchNumber: batch.batchNumber, from: batch.status, to: status, reason } }, tx);
    return updated;
  });
}

// ---------------------------------------------------------------------
// Append-only stock reconciliation — every function here writes exactly
// one PharmacyStockMovement row alongside its batch.quantity change (or,
// for patient returns, no quantity change at all — see the model's own
// doc comment). Nothing here is ever updated after the fact; a correction
// is a new movement row, mirroring PharmacyRestrictedRegister's pattern.
// ---------------------------------------------------------------------

async function loadBatchForMovement(tx: Tx, organizationId: string, batchId: string) {
  const batch = await tx.pharmacyBatch.findFirst({ where: { id: batchId, organizationId } });
  if (!batch) throw new PharmacyNotFoundError("Batch not found.");
  return batch;
}

async function allowsNegative(tx: Tx, organizationId: string) {
  const settings = await tx.pharmacySettings.findUnique({ where: { organizationId } });
  return settings?.allowNegativeStock ?? false;
}

/** Reconciles counted physical stock against the system quantity — the delta may be positive or negative. */
export async function recordStockCount(organizationId: string, actorId: string, data: { batchId: string; countedQuantity: number; reason: string }) {
  if (!Number.isInteger(data.countedQuantity) || data.countedQuantity < 0) throw new PharmacyStockError("Counted quantity must be zero or a positive whole number.");
  if (!data.reason.trim()) throw new PharmacyStockError("A reason is required for a stock count.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-dispense:${organizationId}`}))`;
    const batch = await loadBatchForMovement(tx, organizationId, data.batchId);
    const quantityDelta = data.countedQuantity - batch.quantity;
    const updated = await tx.pharmacyBatch.update({ where: { id: batch.id }, data: { quantity: data.countedQuantity } });
    const movement = await tx.pharmacyStockMovement.create({ data: { organizationId, batchId: batch.id, type: PharmacyStockMovementType.COUNT_ADJUSTMENT, quantityDelta, quantityBefore: batch.quantity, quantityAfter: data.countedQuantity, reason: data.reason, recordedById: actorId } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "stock.counted", entityName: "PharmacyStockMovement", entityId: movement.id, metadata: { batchId: batch.id, quantityDelta } }, tx);
    return updated;
  });
}

/** A general +/- correction (e.g. damaged units found, a data-entry fix) — blocked from taking quantity negative unless the org explicitly allows it. */
export async function recordStockAdjustment(organizationId: string, actorId: string, data: { batchId: string; quantityDelta: number; reason: string }) {
  if (!Number.isInteger(data.quantityDelta) || data.quantityDelta === 0) throw new PharmacyStockError("Adjustment quantity must be a non-zero whole number.");
  if (!data.reason.trim()) throw new PharmacyStockError("A reason is required for a stock adjustment.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-dispense:${organizationId}`}))`;
    const batch = await loadBatchForMovement(tx, organizationId, data.batchId);
    const quantityAfter = batch.quantity + data.quantityDelta;
    if (quantityAfter < 0 && !(await allowsNegative(tx, organizationId))) throw new PharmacyStockError("This adjustment would take the batch below zero.");
    const updated = await tx.pharmacyBatch.update({ where: { id: batch.id }, data: { quantity: quantityAfter } });
    const movement = await tx.pharmacyStockMovement.create({ data: { organizationId, batchId: batch.id, type: PharmacyStockMovementType.ADJUSTMENT, quantityDelta: data.quantityDelta, quantityBefore: batch.quantity, quantityAfter, reason: data.reason, recordedById: actorId } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "stock.adjusted", entityName: "PharmacyStockMovement", entityId: movement.id, metadata: { batchId: batch.id, quantityDelta: data.quantityDelta } }, tx);
    return updated;
  });
}

/** Destroys/discards stock (expired, damaged, recalled) — always a decrease, blocked below zero unless the org allows negative stock. */
export async function recordWriteOff(organizationId: string, actorId: string, data: { batchId: string; quantity: number; reason: string }) {
  if (!Number.isInteger(data.quantity) || data.quantity <= 0) throw new PharmacyStockError("Write-off quantity must be a positive whole number.");
  if (!data.reason.trim()) throw new PharmacyStockError("A reason is required for a write-off.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-dispense:${organizationId}`}))`;
    const batch = await loadBatchForMovement(tx, organizationId, data.batchId);
    const quantityAfter = batch.quantity - data.quantity;
    if (quantityAfter < 0 && !(await allowsNegative(tx, organizationId))) throw new PharmacyStockError("Cannot write off more than the batch currently holds.");
    const updated = await tx.pharmacyBatch.update({ where: { id: batch.id }, data: { quantity: quantityAfter } });
    const movement = await tx.pharmacyStockMovement.create({ data: { organizationId, batchId: batch.id, type: PharmacyStockMovementType.WRITE_OFF, quantityDelta: -data.quantity, quantityBefore: batch.quantity, quantityAfter, reason: data.reason, recordedById: actorId } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "stock.written_off", entityName: "PharmacyStockMovement", entityId: movement.id, metadata: { batchId: batch.id, quantity: data.quantity } }, tx);
    return updated;
  });
}

/** Stock physically leaving for a supplier (recall pickup, over-order return) — always a decrease. */
export async function recordSupplierReturn(organizationId: string, actorId: string, data: { batchId: string; quantity: number; reason: string; reference?: string | null }) {
  if (!Number.isInteger(data.quantity) || data.quantity <= 0) throw new PharmacyStockError("Return quantity must be a positive whole number.");
  if (!data.reason.trim()) throw new PharmacyStockError("A reason is required for a supplier return.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-dispense:${organizationId}`}))`;
    const batch = await loadBatchForMovement(tx, organizationId, data.batchId);
    const quantityAfter = batch.quantity - data.quantity;
    if (quantityAfter < 0 && !(await allowsNegative(tx, organizationId))) throw new PharmacyStockError("Cannot return more than the batch currently holds.");
    const updated = await tx.pharmacyBatch.update({ where: { id: batch.id }, data: { quantity: quantityAfter } });
    const movement = await tx.pharmacyStockMovement.create({ data: { organizationId, batchId: batch.id, type: PharmacyStockMovementType.SUPPLIER_RETURN, quantityDelta: -data.quantity, quantityBefore: batch.quantity, quantityAfter, reason: data.reason, reference: data.reference, recordedById: actorId } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "stock.supplier_returned", entityName: "PharmacyStockMovement", entityId: movement.id, metadata: { batchId: batch.id, quantity: data.quantity } }, tx);
    return updated;
  });
}

/**
 * Records a patient bringing medication back — record-only, quantityDelta
 * is always 0. Returned medication is never silently restocked as
 * dispensable; a pharmacist who inspects and approves it for resale uses
 * recordStockAdjustment separately, with a reason referencing this row's id.
 */
export async function recordPatientReturn(organizationId: string, actorId: string, data: { batchId: string; quantity: number; reason: string }) {
  if (!Number.isInteger(data.quantity) || data.quantity <= 0) throw new PharmacyStockError("Returned quantity must be a positive whole number.");
  if (!data.reason.trim()) throw new PharmacyStockError("A reason is required for a patient return.");
  return db.$transaction(async (tx) => {
    const batch = await loadBatchForMovement(tx, organizationId, data.batchId);
    const movement = await tx.pharmacyStockMovement.create({ data: { organizationId, batchId: batch.id, type: PharmacyStockMovementType.PATIENT_RETURN, quantityDelta: 0, quantityBefore: batch.quantity, quantityAfter: batch.quantity, reason: `${data.reason} (returned quantity: ${data.quantity}, not restocked, inspect before adjusting)`, recordedById: actorId } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "stock.patient_returned", entityName: "PharmacyStockMovement", entityId: movement.id, metadata: { batchId: batch.id, quantity: data.quantity } }, tx);
    return movement;
  });
}

export function listStockMovements(organizationId: string, batchId?: string) {
  return db.pharmacyStockMovement.findMany({ where: { organizationId, batchId }, include: { batch: { include: { medicine: true } } }, orderBy: { recordedAt: "desc" }, take: 500 });
}

export function listPatients(organizationId: string) {
  return db.pharmacyPatient.findMany({ where: { organizationId }, orderBy: { fullName: "asc" } });
}

interface PharmacyPatientInput {
  patientNumber: string;
  fullName: string;
  dateOfBirth?: Date | null;
  sex?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  allergies?: string | null;
  notes?: string | null;
}

export async function createPatient(organizationId: string, data: PharmacyPatientInput) {
  try {
    return await db.pharmacyPatient.create({ data: { organizationId, ...data } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PharmacyStockError("A patient with this patient number already exists.");
    }
    throw error;
  }
}

/** Scoped by organizationId in the same `where` as `id`: a patient id belonging to a different organization throws rather than silently updating it. */
export async function updatePatient(organizationId: string, id: string, data: PharmacyPatientInput) {
  try {
    return await db.pharmacyPatient.update({ where: { id, organizationId }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PharmacyStockError("A patient with this patient number already exists.");
    }
    throw error;
  }
}

/** All prescribers, active or not - the Prescriptions page filters to active ones for the "new prescription" picker itself, but the management list needs to show everything to allow editing/reactivating. */
export function listPrescribers(organizationId: string) {
  return db.pharmacyPrescriber.findMany({ where: { organizationId }, orderBy: { fullName: "asc" } });
}

interface PharmacyPrescriberInput {
  fullName: string;
  registrationNumber: string;
  facilityName?: string | null;
  phone?: string | null;
  active?: boolean;
}

export async function createPrescriber(organizationId: string, data: PharmacyPrescriberInput) {
  try {
    return await db.pharmacyPrescriber.create({ data: { organizationId, ...data } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PharmacyStockError("A prescriber with this registration number already exists.");
    }
    throw error;
  }
}

/** Scoped by organizationId in the same `where` as `id`: a prescriber id belonging to a different organization throws rather than silently updating it. */
export async function updatePrescriber(organizationId: string, id: string, data: PharmacyPrescriberInput) {
  try {
    return await db.pharmacyPrescriber.update({ where: { id, organizationId }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PharmacyStockError("A prescriber with this registration number already exists.");
    }
    throw error;
  }
}

export async function createPrescription(organizationId: string, data: { prescriptionNumber: string; patientId: string; prescriberId: string; prescribedAt: Date; expiresAt?: Date | null; clinicalNotes?: string | null; lines: { medicineId: string; quantityPrescribed: number; dosage: string; frequency: string; duration?: string | null; instructions?: string | null }[] }) {
  if (!data.lines.length || data.lines.some((line) => !Number.isInteger(line.quantityPrescribed) || line.quantityPrescribed <= 0)) throw new PharmacyStockError("Prescription lines are invalid.");
  const [patient, prescriber, medicineCount] = await Promise.all([
    db.pharmacyPatient.findFirst({ where: { id: data.patientId, organizationId, active: true } }),
    db.pharmacyPrescriber.findFirst({ where: { id: data.prescriberId, organizationId, active: true } }),
    db.pharmacyMedicine.count({ where: { id: { in: [...new Set(data.lines.map((line) => line.medicineId))] }, organizationId, active: true } }),
  ]);
  if (!patient || !prescriber || medicineCount !== new Set(data.lines.map((line) => line.medicineId)).size) throw new PharmacyNotFoundError("Prescription reference not found.");
  return db.pharmacyPrescription.create({ data: { organizationId, prescriptionNumber: data.prescriptionNumber, patientId: data.patientId, prescriberId: data.prescriberId, prescribedAt: data.prescribedAt, expiresAt: data.expiresAt, clinicalNotes: data.clinicalNotes, lines: { create: data.lines.map((line) => ({ organizationId, ...line })) } } });
}

export function listDispensings(organizationId: string) {
  return db.pharmacyDispensing.findMany({ where: { organizationId }, include: { patient: true, lines: { include: { medicine: true, batch: true } } }, orderBy: { dispensedAt: "desc" }, take: 200 });
}

/** A single completed dispensing with everything a receipt needs to print - tenant-scoped, and only ever a COMPLETED sale (a pending/rejected/reversed record has nothing to receipt). */
export function getDispensingReceipt(organizationId: string, id: string) {
  return db.pharmacyDispensing.findFirst({
    where: { id, organizationId, status: "COMPLETED" },
    include: { patient: true, lines: { include: { medicine: true, batch: true } } },
  });
}

export function listRestrictedRegister(organizationId: string) {
  return db.pharmacyRestrictedRegister.findMany({ where: { organizationId }, orderBy: { recordedAt: "desc" }, take: 500 });
}

export function getPharmacySettings(organizationId: string) {
  return db.pharmacySettings.upsert({ where: { organizationId }, update: {}, create: { organizationId } });
}

/** Human-readable, collision-resistant counter number generated on the server. */
export async function createDispensingNumber(organizationId: string) {
  const settings = await getPharmacySettings(organizationId);
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${settings.receiptPrefix}-${date}-${randomUUID().slice(0, 6)}`.toUpperCase();
}

export function updatePharmacySettings(organizationId: string, data: { licenceNumber?: string | null; superintendentPharmacist?: string | null; superintendentRegistration?: string | null; receiptPrefix: string; prescriptionValidityDays: number; expiryAlertDays: number; requirePatientForControlled: boolean; controlledDispenseMakerCheckerEnabled: boolean; allowNegativeStock: boolean; smsNotificationsEnabled: boolean }) {
  return db.pharmacySettings.upsert({ where: { organizationId }, update: data, create: { organizationId, ...data } });
}

export function listPrescriptions(organizationId: string) {
  return db.pharmacyPrescription.findMany({ where: { organizationId }, include: { patient: true, prescriber: true, lines: { include: { medicine: true } } }, orderBy: { prescribedAt: "desc" } });
}

async function dispenseLine(tx: Tx, organizationId: string, medicineId: string, quantity: number) {
  let remaining = quantity;
  const allocations: { batchId: string; quantity: number }[] = [];
  const batches = await tx.pharmacyBatch.findMany({
    where: { organizationId, medicineId, status: "AVAILABLE", quantity: { gt: 0 }, expiryDate: { gt: new Date() } },
    orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
  });
  for (const batch of batches) {
    if (!remaining) break;
    const take = Math.min(batch.quantity, remaining);
    const updated = await tx.pharmacyBatch.updateMany({ where: { id: batch.id, organizationId, status: "AVAILABLE", quantity: { gte: take }, expiryDate: { gt: new Date() } }, data: { quantity: { decrement: take } } });
    if (!updated.count) continue;
    allocations.push({ batchId: batch.id, quantity: take });
    remaining -= take;
    if (batch.quantity === take) await tx.pharmacyBatch.update({ where: { id: batch.id }, data: { status: "DEPLETED" } });
  }
  if (remaining) throw new PharmacyStockError("Insufficient eligible non-expired stock.");
  return allocations;
}

/**
 * Finalizes the FEFO allocation + stock decrement + restricted-register
 * side effects for a dispensing whose lines are already known. Shared by
 * the immediate-completion path in dispense() and by
 * approveControlledDispense()'s deferred completion.
 */
async function completeDispensingLines(tx: Tx, organizationId: string, actorId: string, dispensingId: string, lines: PendingDispenseLine[], medicines: { id: string; name: string; sellingPrice: Prisma.Decimal; medicineClass: PharmacyMedicineClass }[], prescription: { id: string; patient: { fullName: string; address: string | null }; prescriber: { fullName: string; registrationNumber: string } } | null) {
  const lineResults: { medicineId: string; batchId: string; quantity: number; unitPrice: Prisma.Decimal; prescriptionLineId?: string | null }[] = [];
  for (const line of lines) {
    const medicine = medicines.find((item) => item.id === line.medicineId)!;
    const allocations = await dispenseLine(tx, organizationId, line.medicineId, line.quantity);
    for (const allocation of allocations) lineResults.push({ medicineId: medicine.id, ...allocation, unitPrice: medicine.sellingPrice, prescriptionLineId: line.prescriptionLineId });
    if (line.prescriptionLineId) await tx.pharmacyPrescriptionLine.update({ where: { id: line.prescriptionLineId }, data: { quantityDispensed: { increment: line.quantity } } });
  }
  for (const line of lineResults) {
    await tx.pharmacyDispensingLine.create({ data: { organizationId, dispensingId, ...line, lineTotal: line.unitPrice.mul(line.quantity) } });
    const medicine = medicines.find((item) => item.id === line.medicineId)!;
    if (medicine.medicineClass === "CONTROLLED") {
      const batch = await tx.pharmacyBatch.findUniqueOrThrow({ where: { id: line.batchId } });
      await tx.pharmacyRestrictedRegister.create({ data: { organizationId, dispensingId, medicineName: medicine.name, batchNumber: batch.batchNumber, quantity: line.quantity, patientName: prescription?.patient.fullName ?? "Recorded walk-in patient", patientAddress: prescription?.patient.address, prescriberName: prescription?.prescriber.fullName, prescriberRegistration: prescription?.prescriber.registrationNumber, recordedById: actorId } });
    }
  }
  if (prescription) {
    const refreshed = await tx.pharmacyPrescriptionLine.findMany({ where: { prescriptionId: prescription.id } });
    const complete = refreshed.every((line) => line.quantityDispensed >= line.quantityPrescribed);
    await tx.pharmacyPrescription.update({ where: { id: prescription.id }, data: { status: complete ? "DISPENSED" : "PARTIALLY_DISPENSED" } });
  }
}

/**
 * Fires after the dispense/approval transaction has already committed - a
 * failed or unconfigured SMS send must never roll back or block stock
 * movement, matching the same after-commit placement used for Payroll's
 * payslip notification. Silently no-ops for a walk-in with no registered
 * patient, an org with the setting off, or a patient with no phone on file.
 */
async function notifyPharmacyPickupReady(organizationId: string, dispensingId: string, patientId: string | null) {
  if (!patientId) return;
  const [settings, patient] = await Promise.all([
    db.pharmacySettings.findUnique({ where: { organizationId } }),
    db.pharmacyPatient.findUnique({ where: { id: patientId } }),
  ]);
  if (!settings?.smsNotificationsEnabled || !patient?.phone) return;
  await sendSms({
    to: patient.phone,
    ...pharmacyPickupReadySms(patient.fullName),
    purpose: "PHARMACY_PICKUP_READY",
    organizationId,
    relatedType: "PharmacyDispensing",
    relatedId: dispensingId,
  });
}

export async function dispense(organizationId: string, actorId: string, data: {
  dispensingNumber: string; patientId?: string | null; prescriptionId?: string | null; discount: string;
  paymentMethod?: string | null; paymentReference?: string | null; lines: { medicineId: string; quantity: number; prescriptionLineId?: string | null }[];
}) {
  if (!data.lines.length || data.lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) throw new PharmacyStockError("Dispensing lines are invalid.");
  const dispensing = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-dispense:${organizationId}`}))`;
    const medicineIds = [...new Set(data.lines.map((line) => line.medicineId))];
    const medicines = await tx.pharmacyMedicine.findMany({ where: { organizationId, id: { in: medicineIds }, active: true } });
    if (medicines.length !== medicineIds.length) throw new PharmacyNotFoundError("Medicine not found.");
    const prescription = data.prescriptionId ? await tx.pharmacyPrescription.findFirst({ where: { id: data.prescriptionId, organizationId, status: { in: ["ACTIVE", "PARTIALLY_DISPENSED"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, include: { lines: true, patient: true, prescriber: true } }) : null;
    if (data.patientId && prescription && prescription.patientId !== data.patientId) throw new PharmacyNotFoundError("Prescription patient mismatch.");
    const patientId = prescription?.patientId ?? data.patientId ?? null;

    const resolvedLines: PendingDispenseLine[] = [];
    for (const line of data.lines) {
      const medicine = medicines.find((item) => item.id === line.medicineId)!;
      const needsPrescription = medicine.requiresPrescription || medicine.medicineClass === "PRESCRIPTION_ONLY" || medicine.medicineClass === "CONTROLLED";
      const prescriptionLine = line.prescriptionLineId ? prescription?.lines.find((item) => item.id === line.prescriptionLineId && item.medicineId === line.medicineId) : null;
      if (needsPrescription && !prescriptionLine) throw new PharmacyPrescriptionRequiredError("Dispensing must match a prescription line.");
      if (prescriptionLine && prescriptionLine.quantityDispensed + line.quantity > prescriptionLine.quantityPrescribed) throw new PharmacyStockError("Dispensing exceeds prescribed quantity.");
      resolvedLines.push({ medicineId: line.medicineId, quantity: line.quantity, prescriptionLineId: prescriptionLine?.id ?? null });
    }

    const subtotal = resolvedLines.reduce((sum, line) => sum.add(medicines.find((m) => m.id === line.medicineId)!.sellingPrice.mul(line.quantity)), new Prisma.Decimal(0));
    const discount = new Prisma.Decimal(data.discount || 0);
    if (discount.isNegative() || discount.gt(subtotal)) throw new PharmacyStockError("Discount is invalid.");

    const hasControlled = medicines.some((medicine) => medicine.medicineClass === "CONTROLLED");
    const settings = await tx.pharmacySettings.findUnique({ where: { organizationId } });
    const makerCheckerEnabled = hasControlled && (settings?.controlledDispenseMakerCheckerEnabled ?? true);

    if (makerCheckerEnabled) {
      const dispensing = await tx.pharmacyDispensing.create({ data: { organizationId, dispensingNumber: data.dispensingNumber, patientId, prescriptionId: prescription?.id ?? null, subtotal, discount, total: subtotal.sub(discount), paymentMethod: data.paymentMethod, paymentReference: data.paymentReference, dispensedById: actorId, status: "PENDING_APPROVAL", makerCheckerEnabled: true, pendingLines: resolvedLines as unknown as Prisma.InputJsonValue } });
      await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "dispensing.requested", entityName: "PharmacyDispensing", entityId: dispensing.id, metadata: { dispensingNumber: dispensing.dispensingNumber, total: dispensing.total.toString(), reason: "controlled-drug maker-checker approval required" } }, tx);
      return dispensing;
    }

    const dispensing = await tx.pharmacyDispensing.create({ data: { organizationId, dispensingNumber: data.dispensingNumber, patientId, prescriptionId: prescription?.id ?? null, subtotal, discount, total: subtotal.sub(discount), paymentMethod: data.paymentMethod, paymentReference: data.paymentReference, dispensedById: actorId } });
    await completeDispensingLines(tx, organizationId, actorId, dispensing.id, resolvedLines, medicines, prescription);
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "dispensing.completed", entityName: "PharmacyDispensing", entityId: dispensing.id, metadata: { dispensingNumber: dispensing.dispensingNumber, total: dispensing.total.toString() } }, tx);
    return dispensing;
  }, { timeout: 15_000 });
  if (dispensing.status === "COMPLETED") await notifyPharmacyPickupReady(organizationId, dispensing.id, dispensing.patientId);
  return dispensing;
}

/**
 * Approves a controlled-drug dispense that's PENDING_APPROVAL. Batch
 * allocation, stock decrement, and the PharmacyRestrictedRegister entry all
 * happen here for the first time — nothing moved when dispense() created
 * the pending request, so a rejected or abandoned request never touched
 * stock. The same-actor guard mirrors HrTerminationRequest.reviewTermination.
 */
export async function approveControlledDispense(organizationId: string, actorId: string, dispensingId: string) {
  const approved = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-dispense:${organizationId}`}))`;
    const dispensing = await tx.pharmacyDispensing.findFirst({ where: { id: dispensingId, organizationId, status: "PENDING_APPROVAL" }, include: { prescription: { include: { patient: true, prescriber: true } } } });
    if (!dispensing) throw new PharmacyNotFoundError("Pending controlled dispense not found.");
    if (dispensing.makerCheckerEnabled && dispensing.dispensedById === actorId) throw new PharmacyWorkflowError("The person who requested this dispense cannot also approve it.");

    const pendingLines = (dispensing.pendingLines as unknown as PendingDispenseLine[] | null) ?? [];
    const medicineIds = [...new Set(pendingLines.map((line) => line.medicineId))];
    const medicines = await tx.pharmacyMedicine.findMany({ where: { organizationId, id: { in: medicineIds } } });
    if (medicines.length !== medicineIds.length) throw new PharmacyNotFoundError("Medicine not found.");

    await completeDispensingLines(tx, organizationId, actorId, dispensing.id, pendingLines, medicines, dispensing.prescription);
    const approved = await tx.pharmacyDispensing.update({ where: { id: dispensing.id }, data: { status: "COMPLETED", approvedById: actorId, approvedAt: new Date() } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "dispensing.approved", entityName: "PharmacyDispensing", entityId: dispensing.id, metadata: { dispensingNumber: dispensing.dispensingNumber } }, tx);
    return approved;
  }, { timeout: 15_000 });
  await notifyPharmacyPickupReady(organizationId, approved.id, approved.patientId);
  return approved;
}

export async function rejectControlledDispense(organizationId: string, actorId: string, dispensingId: string, reason: string) {
  if (!reason.trim()) throw new PharmacyStockError("A rejection reason is required.");
  return db.$transaction(async (tx) => {
    const dispensing = await tx.pharmacyDispensing.findFirst({ where: { id: dispensingId, organizationId, status: "PENDING_APPROVAL" } });
    if (!dispensing) throw new PharmacyNotFoundError("Pending controlled dispense not found.");
    if (dispensing.makerCheckerEnabled && dispensing.dispensedById === actorId) throw new PharmacyWorkflowError("The person who requested this dispense cannot also reject it.");
    const rejected = await tx.pharmacyDispensing.update({ where: { id: dispensing.id }, data: { status: "REJECTED", rejectedById: actorId, rejectedAt: new Date(), rejectionReason: reason } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "dispensing.rejected", entityName: "PharmacyDispensing", entityId: dispensing.id, metadata: { dispensingNumber: dispensing.dispensingNumber, reason } }, tx);
    return rejected;
  });
}

export function listPendingControlledDispenses(organizationId: string) {
  return db.pharmacyDispensing.findMany({ where: { organizationId, status: "PENDING_APPROVAL" }, include: { patient: true }, orderBy: { dispensedAt: "asc" } });
}

export async function reverseDispensing(organizationId: string, actorId: string, dispensingId: string, reason: string) {
  if (!reason.trim()) throw new PharmacyStockError("A reversal reason is required.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-dispense:${organizationId}`}))`;
    const dispensing = await tx.pharmacyDispensing.findFirst({
      where: { id: dispensingId, organizationId, status: "COMPLETED" },
      include: { lines: true, restrictedEntries: true },
    });
    if (!dispensing) throw new PharmacyNotFoundError("Completed dispensing record not found.");

    for (const line of dispensing.lines) {
      const batch = await tx.pharmacyBatch.findFirst({ where: { id: line.batchId, organizationId } });
      if (!batch) throw new PharmacyNotFoundError("Dispensed batch not found.");
      const mayRestoreAvailability = batch.status === "DEPLETED" && batch.expiryDate > new Date();
      await tx.pharmacyBatch.update({ where: { id: batch.id }, data: { quantity: { increment: line.quantity }, ...(mayRestoreAvailability ? { status: "AVAILABLE" } : {}) } });
      if (line.prescriptionLineId) {
        await tx.pharmacyPrescriptionLine.updateMany({ where: { id: line.prescriptionLineId, organizationId, quantityDispensed: { gte: line.quantity } }, data: { quantityDispensed: { decrement: line.quantity } } });
      }
    }

    for (const entry of dispensing.restrictedEntries) {
      await tx.pharmacyRestrictedRegister.create({ data: { organizationId, dispensingId: dispensing.id, medicineName: entry.medicineName, batchNumber: entry.batchNumber, quantity: -entry.quantity, patientName: entry.patientName, patientAddress: entry.patientAddress, prescriberName: entry.prescriberName, prescriberRegistration: entry.prescriberRegistration, recordedById: actorId, reversalOfId: entry.id, reason } });
    }
    if (dispensing.prescriptionId) {
      const lines = await tx.pharmacyPrescriptionLine.findMany({ where: { prescriptionId: dispensing.prescriptionId } });
      const status = lines.every((line) => line.quantityDispensed === 0) ? "ACTIVE" : lines.every((line) => line.quantityDispensed >= line.quantityPrescribed) ? "DISPENSED" : "PARTIALLY_DISPENSED";
      await tx.pharmacyPrescription.updateMany({ where: { id: dispensing.prescriptionId, organizationId }, data: { status } });
    }
    const reversed = await tx.pharmacyDispensing.update({ where: { id: dispensing.id }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: reason } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "dispensing.reversed", entityName: "PharmacyDispensing", entityId: dispensing.id, metadata: { dispensingNumber: dispensing.dispensingNumber, reason } }, tx);
    return reversed;
  });
}

export function getPharmacySummary(organizationId: string) {
  const now = new Date();
  const alertDate = new Date(now.getTime() + 90 * 86_400_000);
  return Promise.all([
    db.pharmacyMedicine.count({ where: { organizationId, active: true } }),
    db.pharmacyBatch.count({ where: { organizationId, status: "AVAILABLE", expiryDate: { gt: now, lte: alertDate }, quantity: { gt: 0 } } }),
    db.pharmacyPrescription.count({ where: { organizationId, status: { in: ["ACTIVE", "PARTIALLY_DISPENSED"] } } }),
    db.pharmacyDispensing.aggregate({ where: { organizationId, status: "COMPLETED", dispensedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } }, _sum: { total: true } }),
  ]).then(([medicineCount, expiringBatches, openPrescriptions, sales]) => ({ medicineCount, expiringBatches, openPrescriptions, monthSales: sales._sum.total ?? new Prisma.Decimal(0) }));
}
