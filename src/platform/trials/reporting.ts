import "server-only";

import { db } from "@/lib/db";
import { getPlatformAnchorOrganizationIds } from "@/lib/platform-organizations";
import { getTrialEndsAt, getTrialDaysRemaining } from "@/platform/trials/service";
import type { OrganizationStatus } from "@prisma/client";

/**
 * Reporting over trial/churn signals, separate from trials/service.ts
 * (which owns the cron expiry logic this file only reads the effects of).
 * Every transition is reconstructed from AuditLog rather than new tracking:
 * updateOrganizationStatus (src/app/app/platform/organizations/actions.ts)
 * logs "organization.status_changed" with {from, to} on every manual
 * change, and expireTrials() (trials/service.ts) logs
 * "organization.trial_expired" with no from/to since the action name alone
 * says TRIAL -> SUSPENDED.
 */
export interface AtRiskTrial {
  organizationId: string;
  name: string;
  tenantCode: string;
  createdAt: Date;
  trialEndsAt: Date;
  daysRemaining: number;
}

export interface OrganizationStatusEvent {
  id: string;
  organizationId: string;
  organizationName: string;
  createdAt: Date;
  from: string | null;
  to: string;
}

export interface TrialAndChurnReport {
  organizationsByStatus: Partial<Record<OrganizationStatus, number>>;
  atRiskTrials: AtRiskTrial[];
  recentEvents: OrganizationStatusEvent[];
  convertedCount: number;
  expiredCount: number;
}

export async function getTrialAndChurnReport(): Promise<TrialAndChurnReport> {
  const anchorIds = await getPlatformAnchorOrganizationIds();
  const excludeAnchor = { notIn: anchorIds };

  const [statusGroups, trialOrganizations, statusChangeEvents, trialExpiredCount, trialConvertedCount] = await Promise.all([
    db.organization.groupBy({ by: ["status"], where: { id: excludeAnchor }, _count: { _all: true } }),
    db.organization.findMany({
      where: { id: excludeAnchor, status: "TRIAL" },
      select: { id: true, name: true, tenantCode: true, createdAt: true },
    }),
    db.auditLog.findMany({
      where: { organizationId: excludeAnchor, action: { in: ["organization.status_changed", "organization.trial_expired"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, organizationId: true, action: true, changes: true, createdAt: true, organization: { select: { name: true } } },
    }),
    db.auditLog.count({ where: { organizationId: excludeAnchor, action: "organization.trial_expired" } }),
    // A dedicated, unbounded count - the 50-row recentEvents window above is
    // for the timeline display only and must never be mistaken for a
    // lifetime total.
    db.auditLog.count({
      where: {
        organizationId: excludeAnchor,
        action: "organization.status_changed",
        AND: [{ changes: { path: ["from"], equals: "TRIAL" } }, { changes: { path: ["to"], equals: "ACTIVE" } }],
      },
    }),
  ]);

  const organizationsByStatus: Partial<Record<OrganizationStatus, number>> = {};
  for (const group of statusGroups) organizationsByStatus[group.status] = group._count._all;

  const now = new Date();
  const atRiskTrials: AtRiskTrial[] = trialOrganizations
    .map((organization) => ({
      organizationId: organization.id,
      name: organization.name,
      tenantCode: organization.tenantCode,
      createdAt: organization.createdAt,
      trialEndsAt: getTrialEndsAt(organization.createdAt),
      daysRemaining: getTrialDaysRemaining(organization.createdAt, now),
    }))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const recentEvents: OrganizationStatusEvent[] = statusChangeEvents.map((event) => {
    const changes = event.changes as { from?: string; to?: string } | null;
    const from = event.action === "organization.trial_expired" ? "TRIAL" : (changes?.from ?? null);
    const to = event.action === "organization.trial_expired" ? "SUSPENDED" : (changes?.to ?? "");
    return {
      id: event.id,
      organizationId: event.organizationId ?? "",
      organizationName: event.organization?.name ?? "Unknown organization",
      createdAt: event.createdAt,
      from,
      to,
    };
  });

  return {
    organizationsByStatus,
    atRiskTrials,
    recentEvents,
    convertedCount: trialConvertedCount,
    expiredCount: trialExpiredCount,
  };
}
