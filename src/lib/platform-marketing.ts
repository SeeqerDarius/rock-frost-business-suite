import "server-only";

import { db } from "@/lib/db";
import { PLATFORM_MEMBERSHIP_ROLE_WHERE } from "@/lib/auth/platform-identity";

export interface ExternalShowcaseCustomer {
  id: string;
  name: string;
  industry: string;
  quote: string;
  attribution: string;
  logoUrl: string;
  enabled: boolean;
}

export interface PlatformMarketingSettings {
  showcaseEnabled: boolean;
  eyebrow: string;
  headline: string;
  description: string;
  showIndustry: boolean;
  externalCustomers: ExternalShowcaseCustomer[];
}

export const DEFAULT_PLATFORM_MARKETING: PlatformMarketingSettings = {
  showcaseEnabled: true,
  eyebrow: "Customer stories",
  headline: "Trusted by organizations building better operations",
  description: "Real organizations using management systems built by Rock Frost.",
  showIndustry: true,
  externalCustomers: [],
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function readPlatformMarketing(metadata: unknown): PlatformMarketingSettings {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return DEFAULT_PLATFORM_MARKETING;
  const raw = (metadata as Record<string, unknown>).publicMarketing;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_PLATFORM_MARKETING;
  const values = raw as Record<string, unknown>;
  const customers = Array.isArray(values.externalCustomers)
    ? values.externalCustomers.flatMap((entry): ExternalShowcaseCustomer[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const customer = entry as Record<string, unknown>;
        const id = text(customer.id);
        const name = text(customer.name);
        const logoUrl = text(customer.logoUrl);
        if (!id || !name || !logoUrl) return [];
        return [{
          id,
          name,
          industry: text(customer.industry),
          quote: text(customer.quote),
          attribution: text(customer.attribution),
          logoUrl,
          enabled: customer.enabled === true,
        }];
      })
    : [];
  return {
    showcaseEnabled: values.showcaseEnabled !== false,
    eyebrow: text(values.eyebrow, DEFAULT_PLATFORM_MARKETING.eyebrow),
    headline: text(values.headline, DEFAULT_PLATFORM_MARKETING.headline),
    description: text(values.description, DEFAULT_PLATFORM_MARKETING.description),
    showIndustry: values.showIndustry !== false,
    externalCustomers: customers,
  };
}

export async function findPlatformOrganizationMetadata() {
  return db.organization.findFirst({
    where: {
      members: { some: { status: "ACTIVE", role: PLATFORM_MEMBERSHIP_ROLE_WHERE } },
    },
    select: { id: true, metadata: true },
  });
}
