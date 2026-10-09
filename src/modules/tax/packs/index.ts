import { buildEuropeanUnionPack, EU_MEMBER_STATES, norwayPack, switzerlandPack, unitedKingdomPack } from "./europe";
import { ghanaPack } from "./ghana";
import type { JurisdictionPack } from "./types";
import { unitedStatesPack } from "./united-states";

export type { JurisdictionPack } from "./types";

/**
 * Registry of jurisdiction packs, keyed by the pack key derived from the
 * organization's jurisdiction (see src/lib/localization.ts). The EU pack is
 * built for the organization's home member state.
 */
const STATIC_PACKS: Record<string, JurisdictionPack> = {
  GH: ghanaPack,
  US: unitedStatesPack,
  GB: unitedKingdomPack,
  CH: switzerlandPack,
  NO: norwayPack,
};

export type PackSummary = { key: string; name: string; version: string; description: string; foundationOnly: boolean; requiresHomeCountry: boolean };

export function listJurisdictionPacks(): PackSummary[] {
  const summaries: PackSummary[] = Object.values(STATIC_PACKS).map((pack) => ({ key: pack.key, name: pack.name, version: pack.version, description: pack.description, foundationOnly: pack.foundationOnly ?? false, requiresHomeCountry: false }));
  summaries.splice(2, 0, { key: "EU", name: "European Union", version: "2026.1", description: "VAT for an EU member state with intra-EU reverse charge, exports, and OSS destination VAT for the other member states.", foundationOnly: false, requiresHomeCountry: true });
  return summaries;
}

export function getJurisdictionPack(key: string | null | undefined, options: { homeCountry?: string | null } = {}): JurisdictionPack | null {
  if (!key) return null;
  const upper = key.toUpperCase();
  if (upper === "EU") {
    const home = options.homeCountry?.toUpperCase();
    if (!home || !EU_MEMBER_STATES.some((state) => state.code === home)) return null;
    return buildEuropeanUnionPack(home);
  }
  return STATIC_PACKS[upper] ?? null;
}

/** Pack key for an organization jurisdiction code (EU-DE -> EU, US-GA -> US, GH -> GH). */
export function packKeyForJurisdiction(jurisdictionCode: string | null | undefined): string | null {
  if (!jurisdictionCode) return null;
  const [prefix] = jurisdictionCode.toUpperCase().split("-");
  return prefix || null;
}

/** Home member state for an EU jurisdiction code (EU-DE -> DE). */
export function homeCountryForJurisdiction(jurisdictionCode: string | null | undefined): string | null {
  const parts = jurisdictionCode?.toUpperCase().split("-") ?? [];
  return parts[0] === "EU" && parts[1] ? parts[1] : null;
}
