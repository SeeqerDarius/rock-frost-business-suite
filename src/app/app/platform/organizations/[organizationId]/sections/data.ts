import type { Prisma } from "@prisma/client";

/**
 * One shared query shape for the Organization Configuration pane, so every
 * section component can be typed from it without each one re-declaring the
 * relations it reads. The pane renders one section at a time, but the page is
 * a single server render either way and these are all indexed lookups on one
 * organization, so splitting the query per section would trade one round trip
 * for six without changing what is fetched.
 */
export const organizationDetailInclude = {
  members: {
    include: { user: true, role: true, branch: true },
    orderBy: { createdAt: "asc" },
  },
  organizationModules: { include: { module: true } },
  moduleRequests: {
    include: { module: true, requestedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  },
  subscriptions: { include: { module: true }, orderBy: { createdAt: "desc" } },
  _count: {
    select: { branches: true, auditLogs: true, notifications: true, moduleRequests: true },
  },
} satisfies Prisma.OrganizationInclude;

export type OrganizationDetail = Prisma.OrganizationGetPayload<{
  include: typeof organizationDetailInclude;
}>;

/** The module catalogue rows the Modules and features section toggles. */
export interface CatalogueModuleRow {
  id: string;
  code: string;
  name: string;
}
