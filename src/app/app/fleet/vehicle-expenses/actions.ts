"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { createFleetVehicleExpense, NotFoundError, InvalidPaymentAmountError } from "@/modules/fleet/service";
import { postFleetVehicleExpense } from "@/modules/fleet/accounting";
import { fleetMaintenancePhotoData } from "@/lib/fleet-maintenance-photo";
import { moneyAmount, cuid, dateInput, optionalLongText, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  FUEL: "Fuel",
  FINE: "Fine",
  INSURANCE_PREMIUM: "Insurance premium",
  LICENSING: "Licensing",
  OTHER: "Other",
};

const expenseSchema = z.object({
  vehicleId: cuid,
  type: z.enum(["FUEL", "FINE", "INSURANCE_PREMIUM", "LICENSING", "OTHER"]),
  amount: moneyAmount,
  date: dateInput.optional(),
  note: optionalLongText,
});

/**
 * Creates the expense, then posts it to Accounting - postFleetVehicleExpense
 * never throws (postModuleExpense swallows its own errors and returns
 * {posted:false, reason:"error"}), so a posting failure never rolls back or
 * blocks the operational record, matching the rest of Fleet's
 * record-then-post convention.
 */
export async function createVehicleExpense(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_VEHICLES_MANAGE)) {
    redirect("/app/fleet/vehicle-expenses?error=forbidden");
  }

  const vehicleId = clean(formData.get("vehicleId"));
  const type = clean(formData.get("type"));
  const amount = clean(formData.get("amount"));
  if (!vehicleId || !type || !amount) {
    redirect("/app/fleet/vehicle-expenses?error=missing-fields");
  }

  const parsed = parseWithSchema(expenseSchema, {
    vehicleId,
    type,
    amount,
    date: clean(formData.get("date")) ?? undefined,
    note: clean(formData.get("note")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/fleet/vehicle-expenses?error=invalid-input");
  }

  const receiptFile = formData.get("receipt");
  const receipt = receiptFile instanceof File && receiptFile.size > 0 ? receiptFile : null;
  const session = await getServerAuthSession();

  let expense;
  try {
    expense = await createFleetVehicleExpense(tenant.organizationId, {
      vehicleId: parsed.data.vehicleId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      date: parsed.data.date ?? new Date(),
      note: parsed.data.note ?? null,
      createdById: session?.user?.id,
      receipt: receipt ? await fleetMaintenancePhotoData(receipt) : null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/vehicle-expenses?error=not-found");
    if (error instanceof InvalidPaymentAmountError) redirect("/app/fleet/vehicle-expenses?error=invalid-input");
    if (error instanceof Error && error.message === "invalid-maintenance-photo") redirect("/app/fleet/vehicle-expenses?error=invalid-photo");
    throw error;
  }

  await postFleetVehicleExpense(
    tenant.organizationId,
    expense,
    `${EXPENSE_TYPE_LABELS[expense.type] ?? expense.type} recorded${parsed.data.note ? `: ${parsed.data.note}` : ""}`,
    session?.user?.id,
  );

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id,
    module: "fleet",
    action: "fleet.vehicle_expense.recorded",
    entityName: "FleetVehicleExpense",
    entityId: expense.id,
    metadata: { vehicleId: expense.vehicleId, type: expense.type, amount: expense.amount.toString() },
  });

  revalidatePath("/app/fleet/vehicle-expenses");
  revalidatePath("/app/fleet/investor");
  redirect("/app/fleet/vehicle-expenses?saved=1");
}
