"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cuid, shortText, longText, dateInput, moneyAmountPositive, moneyAmountNonNegative, parseWithSchema } from "@/lib/validation";
import {
  createHostelBuilding, updateHostelBuilding, createHostelRoom, updateHostelRoom,
  createHostelAllocation, endHostelAllocation, assignHostelWarden, removeHostelWarden,
  createHostelFeeStructure, issueHostelFeeStructure, createHostelFeeInvoice, recordHostelFeePayment,
  HostelStateError, HostelNotFoundError,
} from "@/modules/hostel/service";

const clean = (value: FormDataEntryValue | null) => { const text = String(value ?? "").trim(); return text || null; };
async function auth(permission: string, path: string) { const tenant = await requireModuleAccess("hostel"); if (!hasPermission(tenant, permission)) redirect(`${path}?error=forbidden`); return tenant; }
const fail = (path: string, error: unknown): never => { if (error instanceof HostelStateError) redirect(`${path}?error=state-${error.code}`); if (error instanceof HostelNotFoundError) redirect(`${path}?error=not-found`); throw error; };

export async function createBuildingAction(f: FormData) {
  const path = "/app/hostel/buildings"; const t = await auth(PERMISSIONS.HOSTEL_BUILDINGS_MANAGE, path);
  const p = z.object({ campusId: cuid.nullable(), code: shortText, name: shortText, genderPolicy: shortText.nullable(), address: longText.nullable() }).safeParse({ campusId: clean(f.get("campusId")), code: clean(f.get("code")), name: clean(f.get("name")), genderPolicy: clean(f.get("genderPolicy")), address: clean(f.get("address")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  await createHostelBuilding(t.organizationId, p.data);
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function updateBuildingAction(f: FormData) {
  const path = "/app/hostel/buildings"; const t = await auth(PERMISSIONS.HOSTEL_BUILDINGS_MANAGE, path);
  const id = clean(f.get("id")); if (!id) redirect(`${path}?error=invalid`);
  const p = z.object({ name: shortText, genderPolicy: shortText.nullable(), address: longText.nullable(), active: z.boolean() }).safeParse({ name: clean(f.get("name")), genderPolicy: clean(f.get("genderPolicy")), address: clean(f.get("address")), active: f.get("active") === "on" });
  if (!p.success) redirect(`${path}?error=invalid`);
  try { await updateHostelBuilding(t.organizationId, id, p.data); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createRoomAction(f: FormData) {
  const path = "/app/hostel/buildings"; const t = await auth(PERMISSIONS.HOSTEL_BUILDINGS_MANAGE, path);
  const p = z.object({ buildingId: cuid, roomNumber: shortText, floor: shortText.nullable(), capacity: z.coerce.number().int().min(1).max(20) }).safeParse({ buildingId: clean(f.get("buildingId")), roomNumber: clean(f.get("roomNumber")), floor: clean(f.get("floor")), capacity: clean(f.get("capacity")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  try { await createHostelRoom(t.organizationId, p.data); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function updateRoomAction(f: FormData) {
  const path = "/app/hostel/buildings"; const t = await auth(PERMISSIONS.HOSTEL_BUILDINGS_MANAGE, path);
  const id = clean(f.get("id")); if (!id) redirect(`${path}?error=invalid`);
  const p = z.object({ roomNumber: shortText, floor: shortText.nullable(), active: z.boolean() }).safeParse({ roomNumber: clean(f.get("roomNumber")), floor: clean(f.get("floor")), active: f.get("active") === "on" });
  if (!p.success) redirect(`${path}?error=invalid`);
  try { await updateHostelRoom(t.organizationId, id, p.data); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createAllocationAction(f: FormData) {
  const path = "/app/hostel/allocations"; const t = await auth(PERMISSIONS.HOSTEL_ALLOCATIONS_MANAGE, path);
  const p = parseWithSchema(z.object({ studentId: cuid, bedId: cuid, academicYearId: cuid, checkInDate: dateInput, notes: longText.nullable() }), { studentId: clean(f.get("studentId")) ?? "", bedId: clean(f.get("bedId")) ?? "", academicYearId: clean(f.get("academicYearId")) ?? "", checkInDate: clean(f.get("checkInDate")), notes: clean(f.get("notes")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  try { await createHostelAllocation(t.organizationId, p.data); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function endAllocationAction(f: FormData) {
  const path = "/app/hostel/allocations"; const t = await auth(PERMISSIONS.HOSTEL_ALLOCATIONS_MANAGE, path);
  const p = parseWithSchema(z.object({ id: cuid, checkOutDate: dateInput }), { id: clean(f.get("id")) ?? "", checkOutDate: clean(f.get("checkOutDate")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  try { await endHostelAllocation(t.organizationId, p.data.id, p.data.checkOutDate); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function assignWardenAction(f: FormData) {
  const path = "/app/hostel/wardens"; const t = await auth(PERMISSIONS.HOSTEL_WARDENS_MANAGE, path);
  const p = z.object({ buildingId: cuid, userId: cuid, title: shortText.nullable() }).safeParse({ buildingId: clean(f.get("buildingId")), userId: clean(f.get("userId")), title: clean(f.get("title")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  try { await assignHostelWarden(t.organizationId, p.data); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function removeWardenAction(f: FormData) {
  const path = "/app/hostel/wardens"; const t = await auth(PERMISSIONS.HOSTEL_WARDENS_MANAGE, path);
  const id = clean(f.get("id")); if (!id) redirect(`${path}?error=invalid`);
  try { await removeHostelWarden(t.organizationId, id); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function createFeeStructureAction(f: FormData) {
  const path = "/app/hostel/fees"; const t = await auth(PERMISSIONS.HOSTEL_FEES_MANAGE, path);
  const p = parseWithSchema(z.object({ buildingId: cuid.nullable(), academicYearId: cuid, termId: cuid.nullable(), name: shortText, description: longText.nullable(), amount: moneyAmountPositive, dueDate: dateInput.nullable() }), { buildingId: clean(f.get("buildingId")), academicYearId: clean(f.get("academicYearId")) ?? "", termId: clean(f.get("termId")), name: clean(f.get("name")) ?? "", description: clean(f.get("description")), amount: clean(f.get("amount")), dueDate: clean(f.get("dueDate")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  try { await createHostelFeeStructure(t.organizationId, p.data); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function issueFeeStructureAction(f: FormData) {
  const path = "/app/hostel/fees"; const t = await auth(PERMISSIONS.HOSTEL_FEES_MANAGE, path);
  const feeStructureId = clean(f.get("feeStructureId"));
  if (!feeStructureId || !cuid.safeParse(feeStructureId).success) redirect(`${path}?error=invalid`);
  const result = await issueHostelFeeStructure(t.organizationId, feeStructureId).catch((error) => fail(path, error));
  revalidatePath(path);
  redirect(`${path}?saved=1&issued=${result.issued}&skipped=${result.skipped}`);
}

export async function createFeeInvoiceAction(f: FormData) {
  const path = "/app/hostel/fees"; const t = await auth(PERMISSIONS.HOSTEL_FEES_MANAGE, path);
  const p = parseWithSchema(z.object({ academicYearId: cuid, termId: cuid.nullable(), studentId: cuid, description: shortText, amount: moneyAmountPositive, discount: moneyAmountNonNegative, dueDate: dateInput.nullable() }), { academicYearId: clean(f.get("academicYearId")) ?? "", termId: clean(f.get("termId")), studentId: clean(f.get("studentId")) ?? "", description: clean(f.get("description")) ?? "", amount: clean(f.get("amount")), discount: clean(f.get("discount")) ?? "0", dueDate: clean(f.get("dueDate")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  try { await createHostelFeeInvoice(t.organizationId, p.data); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}

export async function recordFeePaymentAction(f: FormData) {
  const path = "/app/hostel/fees"; const t = await auth(PERMISSIONS.HOSTEL_FEES_MANAGE, path);
  const p = parseWithSchema(z.object({ invoiceId: cuid, amount: moneyAmountPositive, method: z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "ONLINE", "OTHER"]), reference: shortText.nullable() }), { invoiceId: clean(f.get("invoiceId")) ?? "", amount: clean(f.get("amount")), method: clean(f.get("method")), reference: clean(f.get("reference")) });
  if (!p.success) redirect(`${path}?error=invalid`);
  const { invoiceId, ...data } = p.data;
  try { await recordHostelFeePayment(t.organizationId, invoiceId, data); } catch (e) { fail(path, e); }
  revalidatePath(path); redirect(`${path}?saved=1`);
}
