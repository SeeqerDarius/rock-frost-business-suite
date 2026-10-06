"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { LocalizationSettingsError, updateLocalizationSettings } from "@/modules/globalization/organization-localization";

export type LocalizationFormState = { status?: "saved" | "unchanged" | "error"; message?: string };

const TEXT_FIELDS = [
  "legalName", "tradingName", "country", "region", "city", "address", "postalCode", "taxNumber", "vatRegistrationNumber",
  "businessRegistrationNumber", "currency", "fiscalYearStartMonth", "accountingBasis", "timezone", "locale", "dateFormat",
  "numberFormat", "defaultLanguage",
] as const;

export async function updateLocalizationAction(_previous: LocalizationFormState, formData: FormData): Promise<LocalizationFormState> {
  // The organization always comes from the authenticated membership. No
  // organizationId is read from the request.
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) return { status: "error", message: "Only organization administrators can change localization settings." };

  const input: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) input[field] = String(formData.get(field) ?? "");
  const legalEntityType = String(formData.get("legalEntityType") ?? "");
  input.legalEntityType = legalEntityType || null;
  input.pricesIncludeTax = formData.get("pricesIncludeTax") === "on";
  input.confirmBaseCurrencyChange = formData.get("confirmBaseCurrencyChange") === "on";
  input.confirmJurisdictionChange = formData.get("confirmJurisdictionChange") === "on";

  try {
    const result = await updateLocalizationSettings(tenant.organizationId, tenant.userId, input as Parameters<typeof updateLocalizationSettings>[2]);
    if (result.changed.length === 0) return { status: "unchanged", message: "No changes to save." };
    revalidatePath("/app", "layout");
    return { status: "saved", message: `Saved ${result.changed.length} setting${result.changed.length === 1 ? "" : "s"}.` };
  } catch (error) {
    if (error instanceof LocalizationSettingsError) return { status: "error", message: error.message };
    console.error("[localization] update failed", error);
    return { status: "error", message: "Settings could not be saved. Try again." };
  }
}
