"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { parseWithSchema, shortText, cuid, moneyAmount, positiveInt, optionalShortText, optionalLongText, optionalEmail, optionalCoercedDate } from "@/lib/validation";
import { approveControlledDispense, createDispensingNumber, createMedicine, createPatient, createPrescriber, createPrescription, createSupplier, dispense, findBatchByBarcode, findMedicineByBarcode, receiveBatch, recordPatientReturn, recordStockAdjustment, recordStockCount, recordSupplierReturn, recordWriteOff, rejectControlledDispense, reverseDispensing, updateBatchStatus, updatePatient, updatePharmacySettings, updatePrescriber, PharmacyNotFoundError, PharmacyStockError, PharmacyPrescriptionRequiredError, PharmacyWorkflowError } from "@/modules/pharmacy/service";
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
    await runOrRedirect(() => updatePatient(tenant.organizationId, id, data), "/app/pharmacy/patients");
  } else {
    await runOrRedirect(() => createPatient(tenant.organizationId, data), "/app/pharmacy/patients");
  }
  revalidatePath("/app/pharmacy/patients");
  redirect(`/app/pharmacy/patients?saved=${id ? "updated" : "1"}`);
}

const prescriberSchema = z.object({
  id: z.union([cuid, z.literal("")]).optional(),
  fullName: shortText,
  registrationNumber: shortText,
  facilityName: optionalShortText,
  phone: optionalShortText,
});

/** Create or update, depending on whether an `id` is present - same upsert-dialog pattern as `upsertPatient`. */
export async function upsertPrescriber(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_PRESCRIPTIONS_MANAGE, "/app/pharmacy/prescriptions");
  const parsed = parseWithSchema(prescriberSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/prescriptions?error=invalid");
  const { id, ...data } = parsed.data;
  if (id) {
    await runOrRedirect(() => updatePrescriber(tenant.organizationId, id, data), "/app/pharmacy/prescriptions");
  } else {
    await runOrRedirect(() => createPrescriber(tenant.organizationId, data), "/app/pharmacy/prescriptions");
  }
  revalidatePath("/app/pharmacy/prescriptions");
  redirect(`/app/pharmacy/prescriptions?saved=${id ? "updated" : "1"}`);
}

/**
 * A patient/prescriber select can carry this sentinel instead of a real id -
 * the matching "new*" fields are then required and a real record is created
 * inline before the prescription itself, so front-desk staff logging a
 * walk-in's paper prescription never has to leave this dialog first.
 */
const NEW_ENTITY = "__new__";

const addPrescriptionSchema = z.object({
  prescriptionNumber: shortText,
  patientId: z.union([cuid, z.literal(NEW_ENTITY)]),
  newPatientNumber: optionalShortText,
  newPatientFullName: optionalShortText,
  newPatientPhone: optionalShortText,
  prescriberId: z.union([cuid, z.literal(NEW_ENTITY)]),
  newPrescriberFullName: optionalShortText,
  newPrescriberRegistrationNumber: optionalShortText,
  newPrescriberFacilityName: optionalShortText,
  newPrescriberPhone: optionalShortText,
  prescribedAt: z.coerce.date(),
  expiresAt: optionalCoercedDate,
  medicineId: cuid,
  quantityPrescribed: positiveInt,
  dosage: shortText,
  frequency: shortText,
  duration: optionalShortText,
  instructions: optionalLongText,
  clinicalNotes: optionalLongText,
});

export async function addPrescription(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_PRESCRIPTIONS_MANAGE, "/app/pharmacy/prescriptions");
  const parsed = parseWithSchema(addPrescriptionSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/prescriptions?error=invalid");
  const data = parsed.data;

  let patientId = data.patientId;
  if (patientId === NEW_ENTITY) {
    if (!data.newPatientNumber || !data.newPatientFullName) redirect("/app/pharmacy/prescriptions?error=missing-new-patient");
    const patient = await runOrRedirect(
      () => createPatient(tenant.organizationId, { patientNumber: data.newPatientNumber!, fullName: data.newPatientFullName!, phone: data.newPatientPhone }),
      "/app/pharmacy/prescriptions",
    );
    patientId = patient.id;
  }

  let prescriberId = data.prescriberId;
  if (prescriberId === NEW_ENTITY) {
    if (!data.newPrescriberFullName || !data.newPrescriberRegistrationNumber) redirect("/app/pharmacy/prescriptions?error=missing-new-prescriber");
    const prescriber = await runOrRedirect(
      () => createPrescriber(tenant.organizationId, { fullName: data.newPrescriberFullName!, registrationNumber: data.newPrescriberRegistrationNumber!, facilityName: data.newPrescriberFacilityName, phone: data.newPrescriberPhone }),
      "/app/pharmacy/prescriptions",
    );
    prescriberId = prescriber.id;
  }

  await runOrRedirect(
    () => createPrescription(tenant.organizationId, {
      prescriptionNumber: data.prescriptionNumber,
      patientId,
      prescriberId,
      prescribedAt: data.prescribedAt,
      expiresAt: data.expiresAt,
      clinicalNotes: data.clinicalNotes,
      lines: [{ medicineId: data.medicineId, quantityPrescribed: data.quantityPrescribed, dosage: data.dosage, frequency: data.frequency, duration: data.duration, instructions: data.instructions }],
    }),
    "/app/pharmacy/prescriptions",
  );
  revalidatePath("/app/pharmacy");
  redirect("/app/pharmacy/prescriptions?saved=1");
}

export interface CompleteDispensingState {
  error?: string;
  fieldErrors?: Record<string, boolean>;
}

const completeDispensingSchema = z.object({
  mode: z.enum(["prescription", "otc"]),
  patientId: z.union([cuid, z.literal("")]).optional(),
  prescriptionId: z.union([cuid, z.literal("")]).optional(),
  linesJson: z.string().min(2).max(20_000),
  discount: moneyAmount,
  paymentMethod: optionalEnum(["CASH", "CARD", "MOBILE_MONEY", "INSURANCE", "OTHER"]),
  paymentReference: optionalShortText,
});

const dispensingLinesSchema = z.array(z.object({
  medicineId: cuid,
  prescriptionLineId: z.union([cuid, z.literal("")]).optional(),
  quantity: positiveInt,
})).min(1).max(50);

/**
 * Returns state instead of redirecting on failure (the shared runOrRedirect/
 * `?error=` pattern every other Pharmacy action uses) - a hard redirect
 * remounts the whole server-rendered form from scratch, silently discarding
 * everything the user typed, which is exactly the "lost all my inputs"
 * complaint this form got reported for. The client component
 * (dispensing-form.tsx) drives this via useActionState, so a failure just
 * re-renders in place with the same field values still in the DOM.
 */
export async function completeDispensing(_previousState: CompleteDispensingState, formData: FormData): Promise<CompleteDispensingState> {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_DISPENSING_MANAGE, "/app/pharmacy/dispensing");
  const result = completeDispensingSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    const fieldErrors: Record<string, boolean> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key) fieldErrors[key] = true;
    }
    return { error: "Check the highlighted fields and try again.", fieldErrors };
  }
  const parsed = result.data;
  let lines: z.infer<typeof dispensingLinesSchema>;
  try {
    lines = dispensingLinesSchema.parse(JSON.parse(parsed.linesJson));
  } catch {
    return { error: "Select at least one medicine and enter a valid quantity.", fieldErrors: { linesJson: true } };
  }
  if (parsed.mode === "prescription" && !parsed.prescriptionId) {
    return { error: "Select a prescription to dispense.", fieldErrors: { prescriptionId: true } };
  }

  let dispensing;
  try {
    dispensing = await dispense(tenant.organizationId, tenant.userId, {
      dispensingNumber: await createDispensingNumber(tenant.organizationId),
      patientId: parsed.patientId || null,
      prescriptionId: parsed.prescriptionId || null,
      discount: parsed.discount,
      paymentMethod: parsed.paymentMethod,
      paymentReference: parsed.paymentReference,
      lines: lines.map((line) => ({ ...line, prescriptionLineId: line.prescriptionLineId || null })),
    });
  } catch (error) {
    if (error instanceof PharmacyNotFoundError || error instanceof PharmacyStockError || error instanceof PharmacyPrescriptionRequiredError || error instanceof PharmacyWorkflowError) {
      return { error: error.message };
    }
    throw error;
  }

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
  revalidatePath("/app/pharmacy");
  redirect(`/app/pharmacy/dispensing?saved=${dispensing.status === "COMPLETED" ? "completed" : "approval"}`);
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
  await updatePharmacySettings(tenant.organizationId, { ...parsed.data, requirePatientForControlled: formData.get("requirePatientForControlled") === "on", controlledDispenseMakerCheckerEnabled: formData.get("controlledDispenseMakerCheckerEnabled") === "on", allowNegativeStock: formData.get("allowNegativeStock") === "on", smsNotificationsEnabled: formData.get("smsNotificationsEnabled") === "on" });
  revalidatePath("/app/pharmacy/settings"); redirect("/app/pharmacy/settings?saved=1");
}
