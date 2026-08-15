import "server-only";

import { Prisma, PharmacyBatchStatus, PharmacyMedicineClass } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

type Tx = Prisma.TransactionClient;
export class PharmacyNotFoundError extends Error {}
export class PharmacyStockError extends Error {}
export class PharmacyPrescriptionRequiredError extends Error {}

export function listMedicines(organizationId: string) {
  return db.pharmacyMedicine.findMany({ where: { organizationId }, include: { batches: true }, orderBy: { name: "asc" } });
}

export async function createMedicine(organizationId: string, data: {
  sku: string; name: string; genericName?: string | null; strength?: string | null; dosageForm?: string | null;
  unit: string; medicineClass: PharmacyMedicineClass; registrationNumber?: string | null; barcode?: string | null;
  sellingPrice: string; reorderPoint: number; requiresPrescription: boolean;
}) {
  return db.pharmacyMedicine.create({ data: { organizationId, ...data } });
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
  manufactureDate?: Date | null; expiryDate: Date; invoiceReference?: string | null;
}) {
  if (!Number.isInteger(data.quantity) || data.quantity <= 0 || data.expiryDate <= new Date()) throw new PharmacyStockError("Batch quantity and expiry are invalid.");
  const [medicine, supplier] = await Promise.all([
    db.pharmacyMedicine.findFirst({ where: { id: data.medicineId, organizationId, active: true } }),
    data.supplierId ? db.pharmacySupplier.findFirst({ where: { id: data.supplierId, organizationId, active: true } }) : null,
  ]);
  if (!medicine || (data.supplierId && !supplier)) throw new PharmacyNotFoundError("Medicine or supplier not found.");
  return db.$transaction(async (tx) => {
    const batch = await tx.pharmacyBatch.create({ data: { organizationId, ...data, initialQuantity: data.quantity } });
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "batch.received", entityName: "PharmacyBatch", entityId: batch.id, metadata: { medicineId: medicine.id, batchNumber: batch.batchNumber, quantity: batch.quantity } }, tx);
    return batch;
  });
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

export function listPatients(organizationId: string) {
  return db.pharmacyPatient.findMany({ where: { organizationId }, orderBy: { fullName: "asc" } });
}

export function createPatient(organizationId: string, data: { patientNumber: string; fullName: string; dateOfBirth?: Date | null; sex?: string | null; phone?: string | null; email?: string | null; address?: string | null; allergies?: string | null; notes?: string | null }) {
  return db.pharmacyPatient.create({ data: { organizationId, ...data } });
}

export function listPrescribers(organizationId: string) {
  return db.pharmacyPrescriber.findMany({ where: { organizationId, active: true }, orderBy: { fullName: "asc" } });
}

export function createPrescriber(organizationId: string, data: { fullName: string; registrationNumber: string; facilityName?: string | null; phone?: string | null }) {
  return db.pharmacyPrescriber.create({ data: { organizationId, ...data } });
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

export function listRestrictedRegister(organizationId: string) {
  return db.pharmacyRestrictedRegister.findMany({ where: { organizationId }, orderBy: { recordedAt: "desc" }, take: 500 });
}

export function getPharmacySettings(organizationId: string) {
  return db.pharmacySettings.upsert({ where: { organizationId }, update: {}, create: { organizationId } });
}

export function updatePharmacySettings(organizationId: string, data: { licenceNumber?: string | null; superintendentPharmacist?: string | null; superintendentRegistration?: string | null; receiptPrefix: string; prescriptionValidityDays: number; expiryAlertDays: number; requirePatientForControlled: boolean }) {
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

export async function dispense(organizationId: string, actorId: string, data: {
  dispensingNumber: string; patientId?: string | null; prescriptionId?: string | null; discount: string;
  paymentMethod?: string | null; paymentReference?: string | null; lines: { medicineId: string; quantity: number; prescriptionLineId?: string | null }[];
}) {
  if (!data.lines.length || data.lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) throw new PharmacyStockError("Dispensing lines are invalid.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-dispense:${organizationId}`}))`;
    const medicineIds = [...new Set(data.lines.map((line) => line.medicineId))];
    const medicines = await tx.pharmacyMedicine.findMany({ where: { organizationId, id: { in: medicineIds }, active: true } });
    if (medicines.length !== medicineIds.length) throw new PharmacyNotFoundError("Medicine not found.");
    const needsPrescription = medicines.some((medicine) => medicine.requiresPrescription || medicine.medicineClass === "PRESCRIPTION_ONLY" || medicine.medicineClass === "CONTROLLED");
    const prescription = data.prescriptionId ? await tx.pharmacyPrescription.findFirst({ where: { id: data.prescriptionId, organizationId, status: { in: ["ACTIVE", "PARTIALLY_DISPENSED"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, include: { lines: true, patient: true, prescriber: true } }) : null;
    if (needsPrescription && !prescription) throw new PharmacyPrescriptionRequiredError("An active prescription is required.");
    if (data.patientId && prescription && prescription.patientId !== data.patientId) throw new PharmacyNotFoundError("Prescription patient mismatch.");

    const lineResults: { medicineId: string; batchId: string; quantity: number; unitPrice: Prisma.Decimal; prescriptionLineId?: string | null }[] = [];
    for (const line of data.lines) {
      const medicine = medicines.find((item) => item.id === line.medicineId)!;
      const prescriptionLine = line.prescriptionLineId ? prescription?.lines.find((item) => item.id === line.prescriptionLineId && item.medicineId === line.medicineId) : null;
      if (needsPrescription && !prescriptionLine) throw new PharmacyPrescriptionRequiredError("Dispensing must match a prescription line.");
      if (prescriptionLine && prescriptionLine.quantityDispensed + line.quantity > prescriptionLine.quantityPrescribed) throw new PharmacyStockError("Dispensing exceeds prescribed quantity.");
      const allocations = await dispenseLine(tx, organizationId, line.medicineId, line.quantity);
      for (const allocation of allocations) lineResults.push({ medicineId: medicine.id, ...allocation, unitPrice: medicine.sellingPrice, prescriptionLineId: prescriptionLine?.id });
      if (prescriptionLine) await tx.pharmacyPrescriptionLine.update({ where: { id: prescriptionLine.id }, data: { quantityDispensed: { increment: line.quantity } } });
    }
    const subtotal = lineResults.reduce((sum, line) => sum.add(line.unitPrice.mul(line.quantity)), new Prisma.Decimal(0));
    const discount = new Prisma.Decimal(data.discount || 0);
    if (discount.isNegative() || discount.gt(subtotal)) throw new PharmacyStockError("Discount is invalid.");
    const dispensing = await tx.pharmacyDispensing.create({ data: { organizationId, dispensingNumber: data.dispensingNumber, patientId: data.patientId, prescriptionId: data.prescriptionId, subtotal, discount, total: subtotal.sub(discount), paymentMethod: data.paymentMethod, paymentReference: data.paymentReference, dispensedById: actorId } });
    for (const line of lineResults) {
      await tx.pharmacyDispensingLine.create({ data: { organizationId, dispensingId: dispensing.id, ...line, lineTotal: line.unitPrice.mul(line.quantity) } });
      const medicine = medicines.find((item) => item.id === line.medicineId)!;
      if (medicine.medicineClass === "CONTROLLED") {
        const batch = await tx.pharmacyBatch.findUniqueOrThrow({ where: { id: line.batchId } });
        await tx.pharmacyRestrictedRegister.create({ data: { organizationId, dispensingId: dispensing.id, medicineName: medicine.name, batchNumber: batch.batchNumber, quantity: line.quantity, patientName: prescription?.patient.fullName ?? "Recorded walk-in patient", patientAddress: prescription?.patient.address, prescriberName: prescription?.prescriber.fullName, prescriberRegistration: prescription?.prescriber.registrationNumber, recordedById: actorId } });
      }
    }
    if (prescription) {
      const refreshed = await tx.pharmacyPrescriptionLine.findMany({ where: { prescriptionId: prescription.id } });
      const complete = refreshed.every((line) => line.quantityDispensed >= line.quantityPrescribed);
      await tx.pharmacyPrescription.update({ where: { id: prescription.id }, data: { status: complete ? "DISPENSED" : "PARTIALLY_DISPENSED" } });
    }
    await logAuditEvent({ organizationId, userId: actorId, module: "pharmacy", action: "dispensing.completed", entityName: "PharmacyDispensing", entityId: dispensing.id, metadata: { dispensingNumber: dispensing.dispensingNumber, total: dispensing.total.toString() } }, tx);
    return dispensing;
  }, { timeout: 15_000 });
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
