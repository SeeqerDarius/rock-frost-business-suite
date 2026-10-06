import { ghanaPack } from "./ghana";
import type { JurisdictionPack } from "./types";

export type { JurisdictionPack } from "./types";

/**
 * Registry of jurisdiction packs, keyed by the pack key stored on the
 * organization's jurisdiction (see src/lib/localization.ts taxPack).
 */
const PACKS: Record<string, JurisdictionPack> = {
  GH: ghanaPack,
};

export function listJurisdictionPacks(): JurisdictionPack[] {
  return Object.values(PACKS);
}

export function getJurisdictionPack(key: string | null | undefined): JurisdictionPack | null {
  if (!key) return null;
  return PACKS[key.toUpperCase()] ?? null;
}

/** Pack key for an organization jurisdiction code (EU-DE -> EU, US-GA -> US, GH -> GH). */
export function packKeyForJurisdiction(jurisdictionCode: string | null | undefined): string | null {
  if (!jurisdictionCode) return null;
  const [prefix] = jurisdictionCode.toUpperCase().split("-");
  return prefix || null;
}
