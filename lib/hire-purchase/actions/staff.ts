"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { getHirePurchaseSettings } from "../settings";
import { generateStaffCode } from "../ids";
import { assignDefaultInventoryForStaff } from "../inventory";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function createStaff(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const fullName = clean(formData.get("fullName"));
  const email = clean(formData.get("email"));
  const phone = clean(formData.get("phone"));
  const linkUserId = clean(formData.get("userId"));

  if (!fullName || !email) redirect("/hire-purchase/staff/new?error=name-and-email-required");

  const code = await generateStaffCode(tenant.organizationId, fullName);
  const settings = await getHirePurchaseSettings(tenant.organizationId);

  const staff = await db.$transaction(async (tx) => {
    const created = await tx.hirePurchaseStaff.create({
      data: {
        organizationId: tenant.organizationId,
        code,
        fullName,
        email,
        phone: phone || null,
        userId: linkUserId || null,
        monthlySalary: settings.defaultMonthlySalary,
      },
    });

    await tx.hirePurchaseStaffSalaryHistory.create({
      data: {
        organizationId: tenant.organizationId,
        staffId: created.id,
        monthlySalary: settings.defaultMonthlySalary,
        effectiveMonth: new Date(created.createdAt.getFullYear(), created.createdAt.getMonth(), 1),
      },
    });

    await assignDefaultInventoryForStaff({
      tx,
      organizationId: tenant.organizationId,
      staffId: created.id,
      quantity: settings.defaultStaffInventoryQuantity,
    });

    return created;
  }, { timeout: 15000 });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "CREATE_STAFF",
    entityName: "HirePurchaseStaff",
    entityId: staff.id,
    changes: { code, fullName, email },
  });

  revalidatePath("/hire-purchase/staff");
  redirect(`/hire-purchase/staff/${staff.id}`);
}

export async function updateStaff(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const existing = await db.hirePurchaseStaff.findFirst({ where: { id, organizationId: tenant.organizationId } });
  if (!existing) redirect("/hire-purchase/staff?error=staff-not-found");

  const monthlySalaryRaw = Number(clean(formData.get("monthlySalary")));
  const nextSalary = Number.isFinite(monthlySalaryRaw) && monthlySalaryRaw >= 0 ? monthlySalaryRaw : Number(existing.monthlySalary);
  const salaryChanged = nextSalary !== Number(existing.monthlySalary);

  await db.$transaction(async (tx) => {
    await tx.hirePurchaseStaff.update({
      where: { id },
      data: {
        fullName: clean(formData.get("fullName")),
        email: clean(formData.get("email")) || null,
        phone: clean(formData.get("phone")) || null,
        monthlySalary: nextSalary,
      },
    });

    if (salaryChanged) {
      const now = new Date();
      const effectiveMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      await tx.hirePurchaseStaffSalaryHistory.upsert({
        where: { staffId_effectiveMonth: { staffId: id, effectiveMonth } },
        update: { monthlySalary: nextSalary },
        create: { organizationId: tenant.organizationId, staffId: id, monthlySalary: nextSalary, effectiveMonth },
      });
    }
  }, { timeout: 15000 });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "UPDATE_STAFF",
    entityName: "HirePurchaseStaff",
    entityId: id,
    changes: { before: existing, salaryChanged, nextSalary },
  });

  revalidatePath("/hire-purchase/staff");
  revalidatePath(`/hire-purchase/staff/${id}`);
  redirect(`/hire-purchase/staff/${id}`);
}

export async function toggleStaffActive(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const staff = await db.hirePurchaseStaff.findFirst({ where: { id, organizationId: tenant.organizationId } });
  if (!staff) redirect("/hire-purchase/staff?error=staff-not-found");

  await db.hirePurchaseStaff.update({ where: { id }, data: { active: !staff.active } });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: staff.active ? "DEACTIVATE_STAFF" : "REACTIVATE_STAFF",
    entityName: "HirePurchaseStaff",
    entityId: id,
  });

  revalidatePath("/hire-purchase/staff");
  revalidatePath(`/hire-purchase/staff/${id}`);
  redirect(`/hire-purchase/staff/${id}`);
}

export async function recordStaffSalary(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const staffId = clean(formData.get("staffId"));
  const amount = Number(clean(formData.get("amount")));
  const paymentDateValue = clean(formData.get("paymentDate"));
  const salaryMonthValue = clean(formData.get("salaryMonth"));
  const notes = clean(formData.get("notes"));

  if (!staffId) redirect("/hire-purchase/staff?error=staff-required");
  if (!Number.isFinite(amount) || amount <= 0) redirect(`/hire-purchase/staff/${staffId}?error=invalid-salary-amount`);

  const paymentDate = new Date(`${paymentDateValue}T00:00:00`);
  const salaryMonth = new Date(`${salaryMonthValue}T00:00:00`);
  if (Number.isNaN(paymentDate.getTime()) || paymentDate > new Date()) {
    redirect(`/hire-purchase/staff/${staffId}?error=invalid-payment-date`);
  }
  if (Number.isNaN(salaryMonth.getTime())) {
    redirect(`/hire-purchase/staff/${staffId}?error=invalid-salary-month`);
  }

  await db.hirePurchaseStaffSalaryPayment.create({
    data: { organizationId: tenant.organizationId, staffId, amount, paymentDate, salaryMonth, notes: notes || null, paidBy: userId },
  });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "RECORD_STAFF_SALARY",
    entityName: "HirePurchaseStaffSalaryPayment",
    entityId: staffId,
    changes: { amount, paymentDate, salaryMonth },
  });

  revalidatePath(`/hire-purchase/staff/${staffId}`);
  redirect(`/hire-purchase/staff/${staffId}?updated=salary`);
}
