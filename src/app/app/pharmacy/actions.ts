"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { parseWithSchema, shortText, cuid, moneyAmount, positiveInt, email } from "@/lib/validation";
import { createMedicine, createPatient, createPrescriber, createPrescription, createSupplier, dispense, receiveBatch, updatePharmacySettings } from "@/modules/pharmacy/service";

function requirePermission(permission: string, route: string) { return requireModuleAccess("pharmacy").then((tenant) => { if (!hasPermission(tenant, permission)) redirect(`${route}?error=forbidden`); return tenant; }); }

export async function addMedicine(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_MEDICINES_MANAGE, "/app/pharmacy/medicines");
  const parsed = parseWithSchema(z.object({ sku: shortText, name: shortText, genericName: shortText.optional(), strength: shortText.optional(), dosageForm: shortText.optional(), unit: shortText, medicineClass: z.enum(["OTC", "PHARMACY_ONLY", "PRESCRIPTION_ONLY", "CONTROLLED"]), registrationNumber: shortText.optional(), barcode: shortText.optional(), sellingPrice: moneyAmount, reorderPoint: z.coerce.number().int().min(0) }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/medicines?error=invalid");
  await createMedicine(tenant.organizationId, { ...parsed.data, requiresPrescription: formData.get("requiresPrescription") === "on" || ["PRESCRIPTION_ONLY", "CONTROLLED"].includes(parsed.data.medicineClass) });
  revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/medicines?saved=1");
}

export async function addSupplier(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ name: shortText, licenceNumber: shortText.optional(), contactPerson: shortText.optional(), phone: shortText.optional(), email: email.optional(), address: shortText.optional() }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid"); await createSupplier(tenant.organizationId, parsed.data); revalidatePath("/app/pharmacy/stock"); redirect("/app/pharmacy/stock?saved=1");
}

export async function addBatch(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_STOCK_MANAGE, "/app/pharmacy/stock");
  const parsed = parseWithSchema(z.object({ medicineId: cuid, supplierId: z.union([cuid, z.literal("")]).optional(), batchNumber: shortText, quantity: positiveInt, costPrice: moneyAmount, manufactureDate: z.coerce.date().optional(), expiryDate: z.coerce.date(), invoiceReference: shortText.optional() }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/stock?error=invalid"); await receiveBatch(tenant.organizationId, tenant.userId, { ...parsed.data, supplierId: parsed.data.supplierId || null }); revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/stock?saved=1");
}

export async function addPatient(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_PATIENTS_MANAGE, "/app/pharmacy/patients");
  const parsed = parseWithSchema(z.object({ patientNumber: shortText, fullName: shortText, dateOfBirth: z.coerce.date().optional(), sex: shortText.optional(), phone: shortText.optional(), email: email.optional(), address: shortText.optional(), allergies: shortText.optional(), notes: shortText.optional() }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/patients?error=invalid"); await createPatient(tenant.organizationId, parsed.data); revalidatePath("/app/pharmacy/patients"); redirect("/app/pharmacy/patients?saved=1");
}

export async function addPrescriber(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_PRESCRIPTIONS_MANAGE, "/app/pharmacy/prescriptions");
  const parsed = parseWithSchema(z.object({ fullName: shortText, registrationNumber: shortText, facilityName: shortText.optional(), phone: shortText.optional() }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/prescriptions?error=invalid"); await createPrescriber(tenant.organizationId, parsed.data); revalidatePath("/app/pharmacy/prescriptions"); redirect("/app/pharmacy/prescriptions?saved=1");
}

export async function addPrescription(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_PRESCRIPTIONS_MANAGE, "/app/pharmacy/prescriptions");
  const parsed = parseWithSchema(z.object({ prescriptionNumber: shortText, patientId: cuid, prescriberId: cuid, prescribedAt: z.coerce.date(), expiresAt: z.coerce.date().optional(), medicineId: cuid, quantityPrescribed: positiveInt, dosage: shortText, frequency: shortText, duration: shortText.optional(), instructions: shortText.optional(), clinicalNotes: shortText.optional() }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/prescriptions?error=invalid"); const { medicineId, quantityPrescribed, dosage, frequency, duration, instructions, ...header } = parsed.data; await createPrescription(tenant.organizationId, { ...header, lines: [{ medicineId, quantityPrescribed, dosage, frequency, duration, instructions }] }); revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/prescriptions?saved=1");
}

export async function completeDispensing(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_DISPENSING_MANAGE, "/app/pharmacy/dispensing");
  const parsed = parseWithSchema(z.object({ dispensingNumber: shortText, patientId: z.union([cuid, z.literal("")]).optional(), prescriptionId: z.union([cuid, z.literal("")]).optional(), medicineId: cuid, prescriptionLineId: z.union([cuid, z.literal("")]).optional(), quantity: positiveInt, discount: moneyAmount, paymentMethod: shortText.optional(), paymentReference: shortText.optional() }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/dispensing?error=invalid"); await dispense(tenant.organizationId, tenant.userId, { dispensingNumber: parsed.data.dispensingNumber, patientId: parsed.data.patientId || null, prescriptionId: parsed.data.prescriptionId || null, discount: parsed.data.discount, paymentMethod: parsed.data.paymentMethod, paymentReference: parsed.data.paymentReference, lines: [{ medicineId: parsed.data.medicineId, prescriptionLineId: parsed.data.prescriptionLineId || null, quantity: parsed.data.quantity }] }); revalidatePath("/app/pharmacy"); redirect("/app/pharmacy/dispensing?saved=1");
}

export async function saveSettings(formData: FormData) {
  const tenant = await requirePermission(PERMISSIONS.PHARMACY_SETTINGS_MANAGE, "/app/pharmacy/settings");
  const parsed = parseWithSchema(z.object({ licenceNumber: shortText.optional(), superintendentPharmacist: shortText.optional(), superintendentRegistration: shortText.optional(), receiptPrefix: shortText, prescriptionValidityDays: positiveInt, expiryAlertDays: positiveInt }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/pharmacy/settings?error=invalid"); await updatePharmacySettings(tenant.organizationId, { ...parsed.data, requirePatientForControlled: formData.get("requirePatientForControlled") === "on" }); revalidatePath("/app/pharmacy/settings"); redirect("/app/pharmacy/settings?saved=1");
}
