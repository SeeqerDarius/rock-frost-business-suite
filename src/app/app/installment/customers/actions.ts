"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { resolveInstallmentAccessScope } from "@/modules/installment/access";
import { bulkReassignCustomers, createCustomer, updateCustomer, NotFoundError } from "@/modules/installment/service";
import { shortText, longText, parseWithSchema } from "@/lib/validation";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const customerSchema = z.object({
  fullName: shortText,
  staffId: shortText,
  phone: longText.optional(),
  address: longText.optional(),
  nationalId: longText.optional(),
});

export async function upsertCustomer(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE)) {
    redirect("/app/installment/customers?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    redirect("/app/installment/customers?error=staff-unlinked");
  }

  const id = clean(formData.get("id"));
  const fullName = clean(formData.get("fullName"));
  const staffId = clean(formData.get("staffId"));
  if (!fullName || !staffId) {
    redirect("/app/installment/customers?error=missing-fields");
  }

  const parsed = parseWithSchema(customerSchema, {
    fullName,
    staffId,
    phone: clean(formData.get("phone")) ?? undefined,
    address: clean(formData.get("address")) ?? undefined,
    nationalId: clean(formData.get("nationalId")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/installment/customers?error=invalid-input");
  }

  const data = {
    fullName: parsed.data.fullName,
    staffId: parsed.data.staffId,
    phone: parsed.data.phone ?? null,
    address: parsed.data.address ?? null,
    nationalId: parsed.data.nationalId ?? null,
  };

  try {
    if (id) {
      await updateCustomer(tenant.organizationId, scope, id, data);
    } else {
      await createCustomer(tenant.organizationId, scope, data);
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/customers?error=not-found");
    throw error;
  }

  revalidatePath("/app/installment/customers");
  redirect("/app/installment/customers?saved=1");
}

export async function reassignInstallmentCustomers(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE)) {
    redirect("/app/installment/customers?error=forbidden");
  }
  const staffId = clean(formData.get("staffId"));
  const customerIds = formData.getAll("customerIds").map((value) => String(value));
  if (!staffId || customerIds.length === 0) {
    redirect("/app/installment/customers?error=no-selection");
  }
  try {
    const result = await bulkReassignCustomers(tenant.organizationId, customerIds, staffId);
    const session = await getServerAuthSession();
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId: session?.user?.id,
      module: "installment",
      action: "installment.customers.bulk_reassigned",
      entityName: "HirePurchaseCustomer",
      entityId: `bulk:${result.count}`,
      metadata: { customerIds, staffId, count: result.count },
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/customers?error=not-found");
    throw error;
  }
  revalidatePath("/app/installment/customers");
  revalidatePath("/app/installment/accounts");
  redirect(`/app/installment/customers?saved=1&reassigned=${customerIds.length}`);
}
