import "server-only";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM_MEMBERSHIP_ROLE_WHERE } from "@/lib/auth/platform-identity";

/** Busted by every action that changes platform marketing settings, an
 * external showcase customer, or a tenant's public showcase: see
 * updateTag() calls in src/app/app/platform/{settings,organizations}/actions.ts. */
export const PUBLIC_MARKETING_CACHE_TAG = "public-marketing";

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

/** Read on every public homepage view and every showcase-logo request: cached
 * for 5 minutes (Next's Data Cache, not Vercel's edge/CDN cache: this route
 * still renders per-request via connection(), so build time never needs
 * database access, but the expensive query itself no longer runs on every
 * single visit and crawl). Tagged so a settings change reflects immediately
 * instead of waiting out the window. */
export const findPlatformOrganizationMetadata = unstable_cache(
  async () => {
    return db.organization.findFirst({
      where: {
        members: { some: { status: "ACTIVE", role: PLATFORM_MEMBERSHIP_ROLE_WHERE } },
      },
      select: { id: true, metadata: true },
    });
  },
  ["platform-organization-metadata"],
  { revalidate: 300, tags: [PUBLIC_MARKETING_CACHE_TAG] },
);
