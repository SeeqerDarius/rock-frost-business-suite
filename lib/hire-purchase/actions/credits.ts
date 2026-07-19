"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function markCreditRefunded(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_CREDITS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const confirmation = clean(formData.get("confirmation"));
  if (confirmation !== "REFUND") redirect("/hire-purchase/credits?error=confirmation-required");

  const credit = await db.hirePurchaseCredit.findFirst({ where: { id, organizationId: tenant.organizationId } });
  if (!credit) redirect("/hire-purchase/credits?error=credit-not-found");
  if (credit!.status !== "OPEN" || Number(credit!.remainingAmount) <= 0) {
    redirect("/hire-purchase/credits?error=credit-not-open");
  }

  await db.hirePurchaseCredit.update({
    where: { id },
    data: { status: "REFUNDED", remainingAmount: 0, resolvedBy: userId, resolvedAt: new Date() },
  });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "REFUND_CUSTOMER_CREDIT",
    entityName: "HirePurchaseCredit",
    entityId: id,
    changes: { before: credit },
  });

  revalidatePath("/hire-purchase/credits");
  redirect("/hire-purchase/credits?refunded=credit");
}
