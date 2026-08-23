import "server-only";

import { db } from "@/lib/db";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";

export type PublicContactDetails = { salesEmail: string; supportEmail: string; phone: string; whatsapp: string };

export async function getPublicContactDetails(): Promise<PublicContactDetails> {
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
}
