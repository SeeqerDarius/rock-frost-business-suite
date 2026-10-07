import "server-only";

import { Prisma, type OrganizationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ACTIVE_ORGANIZATION_STATUSES, entitledModuleKeysForOrganization } from "@/lib/tenant/entitlements";
import { noticeDeadline, reminderBand } from "./rules";
import { getContractSettings } from "./service";
import { notifyUsers } from "./lifecycle";

const DAY_MS = 86_400_000;
const CLOSED_FOR_REMINDERS = ["ARCHIVED", "CANCELLED", "TERMINATED"] as const;

type Candidate = {
  organizationId: string;
  contractId: string;
  kind: "EXPIRY" | "NOTICE_DEADLINE" | "OBLIGATION" | "MILESTONE";
  targetId: string;
  dueDate: Date;
  band: number;
  recipientUserId: string | null;
  type: string;
  title: string;
  message: string;
};

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const day = (date: Date) => date.toISOString().slice(0, 10);
const inDays = (band: number) => (band === 0 ? "today" : `within ${band} day${band === 1 ? "" : "s"}`);

/**
 * Builds the reminders due for one organization. Each reminder is a band
 * (see reminderBand) so it is delivered once per threshold, and once more
 * when the date has passed.
 */
async function collectCandidates(organizationId: string, today: Date): Promise<Candidate[]> {
  const settings = await getContractSettings(organizationId);
  const candidates: Candidate[] = [];
  const daysUntil = (date: Date) => Math.round((startOfUtcDay(date).getTime() - today.getTime()) / DAY_MS);

  const contracts = await db.contract.findMany({
    where: { organizationId, status: "ACTIVE", expirationDate: { not: null } },
    select: { id: true, contractNumber: true, title: true, expirationDate: true, noticePeriodDays: true, renewalType: true, ownerId: true, createdById: true },
    take: 5000,
  });
  for (const contract of contracts) {
    const recipient = contract.ownerId ?? contract.createdById;
    const expiry = contract.expirationDate!;
    const band = reminderBand(daysUntil(expiry), settings.expiryAlertDays);
    if (band !== null) {
      candidates.push({
        organizationId, contractId: contract.id, kind: "EXPIRY", targetId: contract.id, dueDate: expiry, band, recipientUserId: recipient,
        type: "CONTRACT_EXPIRY_REMINDER",
        title: band === -1 ? `Past expiry: ${contract.contractNumber}` : `Expiring: ${contract.contractNumber}`,
        message: band === -1 ? `${contract.title} passed its expiration date (${day(expiry)}) and is still active. Renew, mark it expired, or record the decision.` : `${contract.title} expires on ${day(expiry)} (${inDays(band)}).`,
      });
    }
    const deadline = noticeDeadline(expiry, contract.noticePeriodDays);
    if (deadline && contract.noticePeriodDays && (contract.renewalType === "AUTO_RENEWAL" || contract.renewalType === "EVERGREEN")) {
      const noticeBand = reminderBand(daysUntil(deadline), settings.expiryAlertDays);
      // A passed notice deadline is not reminded: the renewal can no longer be stopped by notice.
      if (noticeBand !== null && noticeBand >= 0) {
        candidates.push({
          organizationId, contractId: contract.id, kind: "NOTICE_DEADLINE", targetId: contract.id, dueDate: deadline, band: noticeBand, recipientUserId: recipient,
          type: "CONTRACT_NOTICE_DEADLINE",
          title: `Notice deadline: ${contract.contractNumber}`,
          message: `To stop ${contract.title} from renewing, notice is due by ${day(deadline)} (${inDays(noticeBand)}).`,
        });
      }
    }
  }

  const horizon = new Date(today.getTime() + (Math.max(...settings.obligationReminderDays, 0) + 1) * DAY_MS);
  const [obligations, milestones] = await Promise.all([
    db.contractObligation.findMany({
      where: { organizationId, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lte: horizon }, contract: { status: { notIn: [...CLOSED_FOR_REMINDERS] } } },
      select: { id: true, title: true, dueDate: true, ownerId: true, contract: { select: { id: true, contractNumber: true, ownerId: true } } },
      take: 5000,
    }),
    db.contractMilestone.findMany({
      where: { organizationId, status: "PLANNED", dueDate: { lte: horizon }, contract: { status: { notIn: [...CLOSED_FOR_REMINDERS] } } },
      select: { id: true, title: true, dueDate: true, contract: { select: { id: true, contractNumber: true, ownerId: true, createdById: true } } },
      take: 5000,
    }),
  ]);
  for (const obligation of obligations) {
    const band = reminderBand(daysUntil(obligation.dueDate), settings.obligationReminderDays);
    if (band === null) continue;
    candidates.push({
      organizationId, contractId: obligation.contract.id, kind: "OBLIGATION", targetId: obligation.id, dueDate: obligation.dueDate, band, recipientUserId: obligation.ownerId ?? obligation.contract.ownerId,
      type: "CONTRACT_OBLIGATION_REMINDER",
      title: band === -1 ? `Overdue obligation: ${obligation.contract.contractNumber}` : `Obligation due: ${obligation.contract.contractNumber}`,
      message: band === -1 ? `${obligation.title} was due on ${day(obligation.dueDate)}.` : `${obligation.title} is due on ${day(obligation.dueDate)} (${inDays(band)}).`,
    });
  }
  for (const milestone of milestones) {
    const band = reminderBand(daysUntil(milestone.dueDate), settings.obligationReminderDays);
    if (band === null) continue;
    candidates.push({
      organizationId, contractId: milestone.contract.id, kind: "MILESTONE", targetId: milestone.id, dueDate: milestone.dueDate, band, recipientUserId: milestone.contract.ownerId ?? milestone.contract.createdById,
      type: "CONTRACT_MILESTONE_REMINDER",
      title: band === -1 ? `Milestone past due: ${milestone.contract.contractNumber}` : `Milestone due: ${milestone.contract.contractNumber}`,
      message: band === -1 ? `${milestone.title} was planned for ${day(milestone.dueDate)}. Record whether it was achieved or missed.` : `${milestone.title} is planned for ${day(milestone.dueDate)} (${inDays(band)}).`,
    });
  }
  return candidates;
}

/**
 * Daily contract reminders for every organization entitled to Contracts.
 * Delivery is idempotent: each (kind, target, band, due date) is recorded
 * once, so reruns and overlapping runs never send duplicates.
 */
export async function runContractReminders(now = new Date()): Promise<{ organizations: number; candidates: number; sent: number }> {
  const today = startOfUtcDay(now);
  const organizations = await db.organization.findMany({
    where: { status: { in: [...ACTIVE_ORGANIZATION_STATUSES] as OrganizationStatus[] }, contracts: { some: { status: { notIn: [...CLOSED_FOR_REMINDERS] } } } },
    select: { id: true },
  });
  let processed = 0;
  let candidateCount = 0;
  let sent = 0;
  for (const organization of organizations) {
    if (!(await entitledModuleKeysForOrganization(organization.id)).includes("contracts")) continue;
    processed += 1;
    const candidates = await collectCandidates(organization.id, today);
    candidateCount += candidates.length;
    for (const candidate of candidates) {
      if (!candidate.recipientUserId) continue;
      const member = await db.organizationMember.findFirst({ where: { organizationId: candidate.organizationId, userId: candidate.recipientUserId, status: "ACTIVE" }, select: { id: true } });
      if (!member) continue;
      try {
        await db.$transaction(async (tx) => {
          await tx.contractReminder.create({ data: { organizationId: candidate.organizationId, contractId: candidate.contractId, kind: candidate.kind, targetId: candidate.targetId, thresholdDays: candidate.band, dueDate: candidate.dueDate, recipientUserId: candidate.recipientUserId } });
          await notifyUsers(tx, candidate.organizationId, [candidate.recipientUserId], { type: candidate.type, title: candidate.title, message: candidate.message, contractId: candidate.contractId, extra: { kind: candidate.kind, targetId: candidate.targetId } });
        });
        sent += 1;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
  }
  return { organizations: processed, candidates: candidateCount, sent };
}
