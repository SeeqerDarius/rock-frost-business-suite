import type { TaxJurisdictionLevel, TaxKind, TaxTreatment } from "@prisma/client";

/**
 * A jurisdiction pack is static, versioned configuration that seeds an
 * organization's tenant-scoped tax records. Packs never run at calculation
 * time: once seeded, the tenant's own (reviewable, overridable) records are
 * authoritative. Adding a country means adding a pack, not changing
 * Accounting.
 *
 * Rates in packs are starting configuration with a source reference. They
 * are not a statement that an organization is compliant; administrators and
 * their accountants confirm what applies to them.
 */
export type PackJurisdiction = { code: string; name: string; level: TaxJurisdictionLevel; countryCode?: string; parentCode?: string };
export type PackAuthority = { code: string; name: string; jurisdictionCode: string; website?: string };
export type PackCategory = { code: string; name: string; description?: string };
export type PackRate = {
  code: string;
  name: string;
  jurisdictionCode: string;
  authorityCode?: string;
  taxKind: TaxKind;
  rate: string;
  compound?: boolean;
  recoverable?: boolean;
  effectiveFrom: string;
  sourceReference?: string;
  outputAccountCode?: string;
  inputAccountCode?: string;
};
export type PackRule = {
  code: string;
  name: string;
  jurisdictionCode: string;
  categoryCode?: string;
  treatment: TaxTreatment;
  rateCodes: string[];
  effectiveFrom: string;
  sourceReference?: string;
};

export type JurisdictionPack = {
  key: string;
  name: string;
  /** Pack version; bump when the pack's own definitions change. */
  version: string;
  description: string;
  /** True when the pack only provides structure and the administrator must configure rates. */
  foundationOnly?: boolean;
  jurisdictions: PackJurisdiction[];
  authorities: PackAuthority[];
  categories: PackCategory[];
  rates: PackRate[];
  rules: PackRule[];
};
