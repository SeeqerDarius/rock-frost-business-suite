"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createStaff,
  updateStaff,
  recordStaffSalaryPayment,
  deleteStaffSalaryPayment,
  NotFoundError,
  InvalidPaymentAmountError,
  InvalidStaffLoginError,
  StaffLoginAlreadyLinkedError,
} from "@/modules/installment/service";
import { getServerAuthSession } from "@/lib/auth/session";
import { cuid, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertStaff(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE)) {
    redirect("/app/installment/staff?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const fullName = clean(formData.get("fullName"));
  const monthlySalary = clean(formData.get("monthlySalary")) ?? "0";
  if (!fullName) {
    redirect("/app/installment/staff?error=missing-fields");
  }

  const userIdRaw = clean(formData.get("userId"));
  const parsedUserId = userIdRaw ? parseWithSchema(cuid, userIdRaw) : null;
  if (parsedUserId && !parsedUserId.success) {
    redirect("/app/installment/staff?error=invalid-member");
  }
  const userId = parsedUserId?.data ?? null;

  try {
    if (id) {
      await updateStaff(tenant.organizationId, id, {
        fullName,
        email: clean(formData.get("email")),
        phone: clean(formData.get("phone")),
        monthlySalary,
        active: formData.get("active") === "on",
        userId,
      });
    } else {
      await createStaff(tenant.organizationId, {
        fullName,
        email: clean(formData.get("email")),
        phone: clean(formData.get("phone")),
        monthlySalary,
        code: clean(formData.get("code")),
        userId,
      });
    }
  } catch (error) {
    if (error instanceof InvalidStaffLoginError) {
      redirect("/app/installment/staff?error=invalid-member");
    }
    if (error instanceof StaffLoginAlreadyLinkedError) {
      redirect("/app/installment/staff?error=member-already-linked");
    }
    throw error;
  }

  revalidatePath("/app/installment/staff");
  redirect("/app/installment/staff?saved=1");
}

export async function recordSalaryPayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE)) {
    redirect("/app/installment/staff?error=forbidden");
  }

  const staffId = clean(formData.get("staffId"));
  const amount = clean(formData.get("amount"));
  const paymentDateRaw = clean(formData.get("paymentDate"));
  const salaryMonthRaw = clean(formData.get("salaryMonth"));

  if (!staffId || !amount || !paymentDateRaw || !salaryMonthRaw) {
    redirect("/app/installment/staff?error=missing-fields");
  }

  const session = await getServerAuthSession();
  try {
    await recordStaffSalaryPayment(tenant.organizationId, {
      staffId,
      amount,
      paymentDate: new Date(paymentDateRaw),
      salaryMonth: new Date(`${salaryMonthRaw}-01`),
      notes: clean(formData.get("notes")),
      paidBy: session?.user?.name ?? session?.user?.email ?? null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/staff?error=not-found");
    if (error instanceof InvalidPaymentAmountError) redirect("/app/installment/staff?error=invalid-amount");
    throw error;
  }

  revalidatePath("/app/installment/staff");
  redirect("/app/installment/staff?saved=1");
}

export async function removeSalaryPayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE)) {
    redirect("/app/installment/staff?error=forbidden");
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/app/installment/staff?error=missing-fields");
  try {
    await deleteStaffSalaryPayment(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/staff?error=not-found");
    throw error;
  }
  revalidatePath("/app/installment/staff");
  revalidatePath("/app/installment/reports");
  redirect("/app/installment/staff?saved=1");
}
