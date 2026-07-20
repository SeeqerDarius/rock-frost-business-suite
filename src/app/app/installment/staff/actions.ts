"use server";

import { redirect } from "next/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createStaff, updateStaff, recordStaffSalaryPayment } from "@/modules/installment/service";
import { getServerAuthSession } from "@/lib/auth/session";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertStaff(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE)) {
    redirect("/app/installment/staff?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const fullName = clean(formData.get("fullName"));
  const monthlySalary = clean(formData.get("monthlySalary")) ?? "0";
  if (!fullName) {
    redirect("/app/installment/staff?error=missing-fields");
  }

  if (id) {
    await updateStaff(tenant.organizationId, id, {
      fullName,
      email: clean(formData.get("email")),
      phone: clean(formData.get("phone")),
      monthlySalary,
      active: formData.get("active") === "on",
    });
  } else {
    await createStaff(tenant.organizationId, {
      fullName,
      email: clean(formData.get("email")),
      phone: clean(formData.get("phone")),
      monthlySalary,
      code: clean(formData.get("code")),
    });
  }

  redirect("/app/installment/staff?saved=1");
}

export async function recordSalaryPayment(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
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
  await recordStaffSalaryPayment(tenant.organizationId, {
    staffId,
    amount,
    paymentDate: new Date(paymentDateRaw),
    salaryMonth: new Date(`${salaryMonthRaw}-01`),
    notes: clean(formData.get("notes")),
    paidBy: session?.user?.name ?? session?.user?.email ?? null,
  });

  redirect("/app/installment/staff?saved=1");
}
