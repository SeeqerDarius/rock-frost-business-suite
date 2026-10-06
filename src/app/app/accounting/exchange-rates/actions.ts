"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { ExchangeRateError } from "@/modules/globalization/fx";
import { recordExchangeRate } from "@/modules/globalization/exchange-rates";

function value(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

function classify(message: string): string {
  if (message.includes("different currencies")) return "same-currency";
  if (message.toLowerCase().includes("date")) return "date";
  if (message.includes("currency code")) return "currency";
  return "rate";
}

export async function recordExchangeRateAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE)) redirect("/app/accounting/exchange-rates?error=forbidden");
  const baseCurrency = tenant.organization.currency ?? "GHS";
  // Rates are always recorded against the organization's own base currency,
  // read from the session-derived tenant, never from the request.
  const direction = value(formData, "direction");
  const foreignCurrency = value(formData, "foreignCurrency").toUpperCase();
  try {
    await recordExchangeRate({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      fromCurrency: direction === "BASE_TO_FOREIGN" ? baseCurrency : foreignCurrency,
      toCurrency: direction === "BASE_TO_FOREIGN" ? foreignCurrency : baseCurrency,
      rate: value(formData, "rate"),
      rateDate: value(formData, "rateDate"),
      notes: value(formData, "notes"),
    });
  } catch (error) {
    if (error instanceof ExchangeRateError) redirect(`/app/accounting/exchange-rates?error=${classify(error.message)}`);
    throw error;
  }
  revalidatePath("/app/accounting/exchange-rates");
  redirect("/app/accounting/exchange-rates?saved=1");
}
