import "server-only";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";
import { PUBLIC_MARKETING_CACHE_TAG } from "@/lib/platform-marketing";

export type PublicContactDetails = { salesEmail: string; supportEmail: string; phone: string; whatsapp: string };

/** Read on every /contact page view. Cached for 5 minutes (Next's Data Cache):
 * these are operator-configured contact details that change rarely, not
 * per-visitor data, so there is no reason to hit the database on every load.
 * Tagged so a settings change reflects immediately rather than waiting out
 * the window. */
export const getPublicContactDetails = unstable_cache(
  async (): Promise<PublicContactDetails> => {
    const anchorIds = await getPlatformAnchorOrganizationIds();
    const organization = anchorIds.length ? await db.organization.findFirst({
      where: { id: { in: anchorIds } },
      select: { email: true, billingEmail: true, phone: true, metadata: true },
    }) : null;
    const metadata = organization?.metadata && typeof organization.metadata === "object" && !Array.isArray(organization.metadata)
      ? organization.metadata as Record<string, unknown>
      : {};
    const configured = metadata.publicContact && typeof metadata.publicContact === "object" && !Array.isArray(metadata.publicContact)
      ? metadata.publicContact as Record<string, unknown>
      : {};
    const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
    return {
      salesEmail: text(configured.salesEmail) || organization?.billingEmail || organization?.email || "",
      supportEmail: text(configured.supportEmail) || organization?.email || "",
      phone: text(configured.phone) || organization?.phone || "",
      whatsapp: text(configured.whatsapp) || organization?.phone || "",
    };
  },
  ["public-contact-details"],
  { revalidate: 300, tags: [PUBLIC_MARKETING_CACHE_TAG] },
);
