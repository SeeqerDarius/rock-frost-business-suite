"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { cuid, dateInput, longText, parseWithSchema } from "@/lib/validation";
import {
  createInventoryCount,
  InventoryCountApprovalError,
  InventoryCountStateError,
  NotFoundError,
  postInventoryCount,
  reviewInventoryCount,
  submitInventoryCount,
  updateInventoryCountLine,
} from "@/modules/inventory/service";

const PATH = "/app/inventory/counts";
const nonNegativeInt = z.coerce.number().int().min(0);
const createSchema = z.object({ warehouseId: cuid, countDate: dateInput, notes: longText.nullable().optional() });
const lineSchema = z.object({ countId: cuid, lineId: cuid, countedQuantity: nonNegativeInt, notes: longText.nullable().optional() });
const idSchema = z.object({ countId: cuid });
const reviewSchema = z.object({ countId: cuid, decision: z.enum(["APPROVE", "REJECT"]), reason: longText.nullable().optional() });

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

async function context(permission: string) {
  const tenant = await requireModuleAccess("inventory");
  if (!hasPermission(tenant, permission)) redirect(`${PATH}?error=forbidden`);
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  return { tenant, actorId: session.user.id };
}

function fail(error: unknown): never {
  if (error instanceof InventoryCountApprovalError) redirect(`${PATH}?error=maker-checker`);
  if (error instanceof InventoryCountStateError) redirect(`${PATH}?error=state`);
  if (error instanceof NotFoundError) redirect(`${PATH}?error=not-found`);
  throw error;
}

export async function createCountAction(formData: FormData): Promise<void> {
  const { tenant, actorId } = await context(PERMISSIONS.INVENTORY_COUNTS_MANAGE);
  const parsed = parseWithSchema(createSchema, { warehouseId: value(formData, "warehouseId"), countDate: value(formData, "countDate"), notes: value(formData, "notes") });
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  try {
    const count = await createInventoryCount(tenant.organizationId, { ...parsed.data, notes: parsed.data.notes ?? null, createdById: actorId });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: actorId, module: "inventory", action: "count.created", entityName: "InventoryCount", entityId: count.id });
  } catch (error) { fail(error); }
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function updateCountLineAction(formData: FormData): Promise<void> {
  const { tenant, actorId } = await context(PERMISSIONS.INVENTORY_COUNTS_MANAGE);
  const parsed = parseWithSchema(lineSchema, { countId: value(formData, "countId"), lineId: value(formData, "lineId"), countedQuantity: value(formData, "countedQuantity"), notes: value(formData, "notes") });
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  try {
    await updateInventoryCountLine(tenant.organizationId, parsed.data.countId, parsed.data.lineId, parsed.data.countedQuantity, parsed.data.notes);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: actorId, module: "inventory", action: "count.line_recorded", entityName: "InventoryCount", entityId: parsed.data.countId, metadata: { lineId: parsed.data.lineId } });
  } catch (error) { fail(error); }
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function submitCountAction(formData: FormData): Promise<void> {
  const { tenant, actorId } = await context(PERMISSIONS.INVENTORY_COUNTS_MANAGE);
  const parsed = parseWithSchema(idSchema, { countId: value(formData, "countId") });
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  try {
    const count = await submitInventoryCount(tenant.organizationId, parsed.data.countId);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: actorId, module: "inventory", action: "count.submitted", entityName: "InventoryCount", entityId: count.id });
  } catch (error) { fail(error); }
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function reviewCountAction(formData: FormData): Promise<void> {
  const { tenant, actorId } = await context(PERMISSIONS.INVENTORY_COUNTS_APPROVE);
  const parsed = parseWithSchema(reviewSchema, { countId: value(formData, "countId"), decision: value(formData, "decision"), reason: value(formData, "reason") });
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  try {
    const count = await reviewInventoryCount(tenant.organizationId, parsed.data.countId, { decision: parsed.data.decision, actorId, reason: parsed.data.reason });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: actorId, module: "inventory", action: parsed.data.decision === "APPROVE" ? "count.approved" : "count.rejected", entityName: "InventoryCount", entityId: count.id });
  } catch (error) { fail(error); }
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function postCountAction(formData: FormData): Promise<void> {
  const { tenant, actorId } = await context(PERMISSIONS.INVENTORY_COUNTS_APPROVE);
  const parsed = parseWithSchema(idSchema, { countId: value(formData, "countId") });
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  try {
    const count = await postInventoryCount(tenant.organizationId, parsed.data.countId, actorId);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: actorId, module: "inventory", action: "count.posted", entityName: "InventoryCount", entityId: count.id });
  } catch (error) { fail(error); }
  revalidatePath(PATH);
  revalidatePath("/app/inventory/stock");
  revalidatePath("/app/inventory/movements");
  redirect(`${PATH}?saved=1`);
}
