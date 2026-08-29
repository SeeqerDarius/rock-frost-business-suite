import "server-only";

import { isGatewayConfigured, listPaystackBanks } from "@/lib/payments";

export interface BankOption {
  code: string;
  name: string;
}

/**
 * Live Paystack bank list for the account-setup step's picker - replaces the
 * old free-text "Paystack bank code" input, which let an admin type anything
 * at all. Returns an empty list (never throws) when Paystack isn't
 * configured or the live call fails, so a transient outage degrades the page
 * to "bank list unavailable" rather than crashing the whole wizard.
 */
export async function loadBankOptions(): Promise<BankOption[]> {
  if (!isGatewayConfigured("PAYSTACK")) return [];
  try {
    const banks = await listPaystackBanks("ghana");
    if (!Array.isArray(banks)) return [];
    return banks
      .map((bank: unknown): BankOption | null => {
        if (!bank || typeof bank !== "object") return null;
        const record = bank as Record<string, unknown>;
        const code = typeof record.code === "string" ? record.code : null;
        const name = typeof record.name === "string" ? record.name : null;
        return code && name ? { code, name } : null;
      })
      .filter((option): option is BankOption => option !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("[payments] Failed to load the Paystack bank list", error);
    return [];
  }
}
