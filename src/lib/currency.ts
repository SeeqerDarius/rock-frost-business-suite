import type { Prisma } from "@prisma/client";
import { getDefaultLocaleForCurrency } from "@/lib/localization";

/**
 * Every monetary amount in the product should render through this, so a
 * figure is never shown as a bare number with no currency attached.
 * Defaults to GHS to preserve existing Ghana organizations. Callers that have
 * organization localization settings should pass the organization's locale as
 * the third argument; currency alone cannot distinguish (for example) France
 * from Germany.
 */
export function formatMoney(value: Prisma.Decimal | number | string | null | undefined, currencyCode?: string | null, locale?: string | null): string {
  const amount = Number(value ?? 0);
  const code = currencyCode?.trim() || "GHS";
  const selectedLocale = locale?.trim() || getDefaultLocaleForCurrency(code);
  try {
    return new Intl.NumberFormat(selectedLocale, { style: "currency", currency: code }).format(amount);
  } catch {
    try {
      return new Intl.NumberFormat(getDefaultLocaleForCurrency(code), { style: "currency", currency: code }).format(amount);
    } catch {
      // Preserve the supplied code for invalid configuration instead of
      // silently labeling a non-GHS amount as Ghanaian cedi.
      return `${new Intl.NumberFormat("en-GH").format(amount)} ${code}`;
    }
  }
}
