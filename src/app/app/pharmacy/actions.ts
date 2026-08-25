"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { parseWithSchema, shortText, cuid, moneyAmount, positiveInt, optionalShortText, optionalLongText, optionalEmail, optionalCoercedDate } from "@/lib/validation";
import { approveControlledDispense, createMedicine, createPatient, createPrescriber, createPrescription, createSupplier, dispense, findBatchByBarcode, findMedicineByBarcode, receiveBatch, recordPatientReturn, recordStockAdjustment, recordStockCount, recordSupplierReturn, recordWriteOff, rejectControlledDispense, reverseDispensing, updateBatchStatus, updatePatient, updatePharmacySettings, PharmacyNotFoundError, PharmacyStockError, PharmacyPrescriptionRequiredError, PharmacyWorkflowError } from "@/modules/pharmacy/service";
import { postModuleRevenue, reverseModuleRevenue } from "@/lib/accounting-integration";

/** Blank-string-safe optional enum, e.g. an unselected `<select>` submits `""`, not an absent key. */
function optionalEnum<T extends [string, ...string[]]>(values: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), z.enum(values).optional());
}

function requirePermission(permission: string, route: string) { return requireModuleAccess("pharmacy").then((tenant) => { if (!hasPermission(tenant, permission)) redirect(`${route}?error=forbidden`); return tenant; }); }

/**
 * Domain/business-rule errors thrown by the service layer (e.g. "Batch quantity
 * and expiry are invalid.") are already safe, user-facing sentences: without
 * this, they crash to Next.js's generic error page instead of redirecting back
 * to the form with the actual reason.
 */
async function runOrRedirect<T>(run: () => Promise<T>, errorRoute: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PharmacyNotFoundError || error instanceof PharmacyStockError || error instanceof PharmacyPrescriptionRequiredError || error instanceof PharmacyWorkflowError) {
      redirect(`${errorRoute}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}

export interface BarcodeLookupState {
  medicine?: { id: string; name: string; sku: string } | null;
  batch?: { id: string; batchNumber: string; medicineName: string; quantity: number } | null;
  searched?: boolean;
}

/** Tenant-scoped: the organization always comes from the authenticated session, never from the form. */
export async function lookupBarcodeAction(_previousState: BarcodeLookupState, formData: FormData): Promise<BarcodeLookupState> {
  const tenant = await requireModuleAccess("pharmacy");
  if (!hasPermission(tenant, PERMISSIONS.PHARMACY_VIEW) && !hasPermission(tenant, PERMISSIONS.PHARMACY_MEDICINES_MANAGE) && !hasPermission(tenant, PERMISSIONS.PHARMACY_STOCK_MANAGE)) return { searched: true };
  const barcode = String(formData.get("barcode") ?? "").trim();
  if (!barcode) return {};
  const [medicine, batch] = await Promise.all([findMedicineByBarcode(tenant.organizationId, barcode), findBatchByBarcode(tenant.organizationId, barcode)]);
  return {
    searched: true,
    medicine: medicine ? { id: medicine.id, name: medicine.name, sku: medicine.sku } : null,
    batch: batch ? { id: batch.id, batchNumber: batch.batchNumber, medicineName: batch.medicine.name, quantity: batch.quantity } : null,
  };
}

export async function addMedicine(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_MEDICINES_MANAGE, "/app/pharmacy/medicines");
  const parsed = parseWithSchema(z.object({ sku: shortText, name: shortText, genericName: optionalShortText, strength: optionalShortText, dosageForm: optionalShortText, unit: shortText, medicineClass: z.enum(["OTC", "PHARMACY_ONLY", "PRESCRIPTION_ONLY", "CONTROLLED"]), registrationNumber: optionalShortText, barcode: optionalShortText, sellingPrice: moneyAmount, reorderPoint: z.coerce.number().int().min(0) }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/medicines?error=invalid");
  await runOrRedirect(() => createMedicine(tenant.organizationId, { ...parsed.data, requiresPrescription: formData.get("requiresPrescription") === "on" || ["PRESCRIPTION_ONLY", "CONTROLLED"].includes(parsed.data.medicineClass) }), "/app/pharmacy/medicines");
  revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/medicines?saved=1");
}

export async function addSupplier(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ name: shortText, licenceNumber: optionalShortText, contactPerson: optionalShortText, phone: optionalShortText, email: optionalEmail, address: optionalShortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid"); await createSupplier(tenant.organizationId, parsed.data); revalidatePath("/app/pharmacy/stock"); redirect("/app/pharmacy/stock?saved=1");
}

export async function addBatch(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ medicineId: cuid, supplierId: z.union([cuid, z.literal("")]).optional(), batchNumber: shortText, quantity: positiveInt, costPrice: moneyAmount, manufactureDate: optionalCoercedDate, expiryDate: z.coerce.date(), invoiceReference: optionalShortText, barcode: optionalShortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid"); await runOrRedirect(() => receiveBatch(tenant.organizationId, tenant.userId, { ...parsed.data, supplierId: parsed.data.supplierId || null, barcode: parsed.data.barcode || null }), "/app/pharmacy/stock"); revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/stock?saved=1");
}

export async function recordStockCountAction(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ batchId: cuid, countedQuantity: z.coerce.number().int().min(0), reason: shortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid");
  await runOrRedirect(() => recordStockCount(tenant.organizationId, tenant.userId, parsed.data), "/app/pharmacy/stock"); revalidatePath("/app/pharmacy/stock"); redirect("/app/pharmacy/stock?saved=1");
}

export async function recordStockAdjustmentAction(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ batchId: cuid, quantityDelta: z.coerce.number().int(), reason: shortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid");
  await runOrRedirect(() => recordStockAdjustment(tenant.organizationId, tenant.userId, parsed.data), "/app/pharmacy/stock"); revalidatePath("/app/pharmacy/stock"); redirect("/app/pharmacy/stock?saved=1");
}

export async function recordWriteOffAction(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ batchId: cuid, quantity: positiveInt, reason: shortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid");
  await runOrRedirect(() => recordWriteOff(tenant.organizationId, tenant.userId, parsed.data), "/app/pharmacy/stock"); revalidatePath("/app/pharmacy/stock"); redirect("/app/pharmacy/stock?saved=1");
}

export async function recordSupplierReturnAction(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ batchId: cuid, quantity: positiveInt, reason: shortText, reference: optionalShortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid");
  await runOrRedirect(() => recordSupplierReturn(tenant.organizationId, tenant.userId, parsed.data), "/app/pharmacy/stock"); revalidatePath("/app/pharmacy/stock"); redirect("/app/pharmacy/stock?saved=1");
}

export async function recordPatientReturnAction(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ batchId: cuid, quantity: positiveInt, reason: shortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid");
  await runOrRedirect(() => recordPatientReturn(tenant.organizationId, tenant.userId, parsed.data), "/app/pharmacy/stock"); revalidatePath("/app/pharmacy/stock"); redirect("/app/pharmacy/stock?saved=1");
}

export async function changeBatchStatus(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ batchId: cuid, status: z.enum(["AVAILABLE", "QUARANTINED", "RECALLED"]), reason: shortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid");
  await runOrRedirect(() => updateBatchStatus(tenant.organizationId, tenant.userId, parsed.data.batchId, parsed.data.status, parsed.data.reason), "/app/pharmacy/stock");
  revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/stock?saved=1");
}

const patientSchema = z.object({
  id: z.union([cuid, z.literal("")]).optional(),
  patientNumber: shortText,
  fullName: shortText,
  dateOfBirth: optionalCoercedDate,
  sex: optionalEnum(["MALE", "FEMALE", "OTHER"]),
  phone: optionalShortText,
  email: optionalEmail,
  address: optionalShortText,
  allergies: optionalShortText,
  notes: optionalLongText,
});

/** Create or update, depending on whether an `id` is present - matches the upsert-dialog pattern used across other modules (e.g. CRM contacts). */
export async function upsertPatient(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_PATIENTS_MANAGE, "/app/pharmacy/patients");
  const parsed = parseWithSchema(patientSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/patients?error=invalid");
  const { id, ...data } = parsed.data;
  if (id) {
    await updatePatient(tenant.organizationId, id, data);
  } else {
    await createPatient(tenant.organizationId, data);
  }
  revalidatePath("/app/pharmacy/patients");
  redirect(`/app/pharmacy/patients?saved=${id ? "updated" : "1"}`);
}

export async function addPrescriber(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_PRESCRIPTIONS_MANAGE, "/app/pharmacy/prescriptions");
  const parsed = parseWithSchema(z.object({ fullName: shortText, registrationNumber: shortText, facilityName: optionalShortText, phone: optionalShortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/prescriptions?error=invalid"); await createPrescriber(tenant.organizationId, parsed.data); revalidatePath("/app/pharmacy/prescriptions"); redirect("/app/pharmacy/prescriptions?saved=1");
}

export async function addPrescription(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_PRESCRIPTIONS_MANAGE, "/app/pharmacy/prescriptions");
  const parsed = parseWithSchema(z.object({ prescriptionNumber: shortText, patientId: cuid, prescriberId: cuid, prescribedAt: z.coerce.date(), expiresAt: optionalCoercedDate, medicineId: cuid, quantityPrescribed: positiveInt, dosage: shortText, frequency: shortText, duration: optionalShortText, instructions: optionalLongText, clinicalNotes: optionalLongText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/prescriptions?error=invalid"); const { medicineId, quantityPrescribed, dosage, frequency, duration, instructions, ...header } = parsed.data; await runOrRedirect(() => createPrescription(tenant.organizationId, { ...header, lines: [{ medicineId, quantityPrescribed, dosage, frequency, duration, instructions }] }), "/app/pharmacy/prescriptions"); revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/prescriptions?saved=1");
}

export async function completeDispensing(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_DISPENSING_MANAGE, "/app/pharmacy/dispensing");
  const parsed = parseWithSchema(z.object({ dispensingNumber: shortText, patientId: z.union([cuid, z.literal("")]).optional(), prescriptionId: z.union([cuid, z.literal("")]).optional(), medicineId: cuid, prescriptionLineId: z.union([cuid, z.literal("")]).optional(), quantity: positiveInt, discount: moneyAmount, paymentMethod: optionalEnum(["CASH", "CARD", "MOBILE_MONEY", "INSURANCE", "OTHER"]), paymentReference: optionalShortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/dispensing?error=invalid");
  const dispensing = await runOrRedirect(() => dispense(tenant.organizationId, tenant.userId, { dispensingNumber: parsed.data.dispensingNumber, patientId: parsed.data.patientId || null, prescriptionId: parsed.data.prescriptionId || null, discount: parsed.data.discount, paymentMethod: parsed.data.paymentMethod, paymentReference: parsed.data.paymentReference, lines: [{ medicineId: parsed.data.medicineId, prescriptionLineId: parsed.data.prescriptionLineId || null, quantity: parsed.data.quantity }] }), "/app/pharmacy/dispensing");
  // A controlled-drug dispense with maker-checker enabled comes back
  // PENDING_APPROVAL: nothing was actually dispensed yet (see dispense()'s
  // own doc comment), so revenue posts only once approveControlledDispense()
  // completes it, not here.
  if (dispensing.status === "COMPLETED") {
    await postModuleRevenue(tenant.organizationId, {
      sourceModule: "pharmacy",
      sourceType: "PHARMACY_DISPENSING",
      sourceId: dispensing.id,
      postingPurpose: "COLLECTED",
      amount: dispensing.total.toString(),
      entryDate: dispensing.dispensedAt,
      description: `Pharmacy dispensing ${dispensing.dispensingNumber}`,
      createdById: tenant.userId,
    });
  }
  revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/dispensing?saved=1");
}

export async function approveControlledDispenseAction(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_RESTRICTED_APPROVE, "/app/pharmacy/dispensing");
  const parsed = parseWithSchema(z.object({ dispensingId: cuid }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/dispensing?error=invalid");
  const approved = await runOrRedirect(() => approveControlledDispense(tenant.organizationId, tenant.userId, parsed.data.dispensingId), "/app/pharmacy/dispensing");
  await postModuleRevenue(tenant.organizationId, {
    sourceModule: "pharmacy",
    sourceType: "PHARMACY_DISPENSING",
    sourceId: approved.id,
    postingPurpose: "COLLECTED",
    amount: approved.total.toString(),
    entryDate: approved.dispensedAt,
    description: `Pharmacy dispensing ${approved.dispensingNumber} (controlled, approved)`,
    createdById: tenant.userId,
  });
  revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/dispensing?saved=1");
}

export async function rejectControlledDispenseAction(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_RESTRICTED_APPROVE, "/app/pharmacy/dispensing");
  const parsed = parseWithSchema(z.object({ dispensingId: cuid, reason: shortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/dispensing?error=invalid");
  await runOrRedirect(() => rejectControlledDispense(tenant.organizationId, tenant.userId, parsed.data.dispensingId, parsed.data.reason), "/app/pharmacy/dispensing");
  revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/dispensing?saved=1");
}

export async function reverseCompletedDispensing(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_DISPENSING_MANAGE, "/app/pharmacy/dispensing");
  const parsed = parseWithSchema(z.object({ dispensingId: cuid, reason: shortText }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/dispensing?error=invalid");
  await runOrRedirect(() => reverseDispensing(tenant.organizationId, tenant.userId, parsed.data.dispensingId, parsed.data.reason), "/app/pharmacy/dispensing");
  await reverseModuleRevenue(tenant.organizationId, { sourceType: "PHARMACY_DISPENSING", sourceId: parsed.data.dispensingId, postingPurpose: "COLLECTED", reason: parsed.data.reason, actorId: tenant.userId });
  revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/dispensing?saved=1");
}

export async function saveSettings(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_SETTINGS_MANAGE, "/app/pharmacy/settings");
  const parsed = parseWithSchema(z.object({ licenceNumber: optionalShortText, superintendentPharmacist: optionalShortText, superintendentRegistration: optionalShortText, receiptPrefix: shortText, prescriptionValidityDays: positiveInt, expiryAlertDays: positiveInt }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/settings?error=invalid");
  await updatePharmacySettings(tenant.organizationId, { ...parsed.data, requirePatientForControlled: formData.get("requirePatientForControlled") === "on", controlledDispenseMakerCheckerEnabled: formData.get("controlledDispenseMakerCheckerEnabled") === "on", allowNegativeStock: formData.get("allowNegativeStock") === "on" });
  revalidatePath("/app/pharmacy/settings"); redirect("/app/pharmacy/settings?saved=1");
}
