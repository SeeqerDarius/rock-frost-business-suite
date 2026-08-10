import type { Prisma } from "@prisma/client";

export interface PublicShowcaseSettings {
  enabled: boolean;
  quote: string;
  attribution: string;
}

export const PUBLIC_SHOWCASE_FILTER: Prisma.OrganizationWhereInput = {
  status: "ACTIVE",
  logoUrl: { not: null },
  metadata: { path: ["publicShowcase", "enabled"], equals: true },
};

export function readPublicShowcase(metadata: unknown): PublicShowcaseSettings {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { enabled: false, quote: "", attribution: "" };
  }
  const showcase = (metadata as Record<string, unknown>).publicShowcase;
  if (!showcase || typeof showcase !== "object" || Array.isArray(showcase)) {
    return { enabled: false, quote: "", attribution: "" };
  }
  const values = showcase as Record<string, unknown>;
  return {
    enabled: values.enabled === true,
    quote: typeof values.quote === "string" ? values.quote : "",
    attribution: typeof values.attribution === "string" ? values.attribution : "",
  };
}
