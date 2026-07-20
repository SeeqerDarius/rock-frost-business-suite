import "server-only";

import { db } from "@/lib/db";
import type { CrmDealStage, CrmActivityType, CrmLeadStatus } from "@prisma/client";

/**
 * Fresh module (no reference implementation to migrate from) — first CRM
 * built for this platform. Every function takes organizationId explicitly
 * and filters on it, per docs/MODULE_BOUNDARIES.md.
 */

// --- Assignable users (organization members, for owner selects) ---

export async function listAssignableUsers(organizationId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((m) => m.user);
}

// --- Lead sources (organization-configurable list, mirrors HirePurchaseProductCategory's pattern) ---

export function listLeadSources(organizationId: string) {
  return db.crmLeadSource.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function createLeadSource(organizationId: string, name: string) {
  return db.crmLeadSource.create({ data: { organizationId, name } });
}

// --- Contacts ---

export function listContacts(organizationId: string) {
  return db.crmContact.findMany({ where: { organizationId }, include: { owner: true }, orderBy: { createdAt: "desc" } });
}

interface ContactInput {
  fullName: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  notes?: string | null;
  ownerId?: string | null;
}

export function createContact(organizationId: string, data: ContactInput) {
  return db.crmContact.create({ data: { organizationId, ...data } });
}

export function updateContact(organizationId: string, id: string, data: ContactInput) {
  return db.crmContact.update({ where: { id, organizationId }, data });
}

// --- Leads ---

export function listLeads(organizationId: string) {
  return db.crmLead.findMany({ where: { organizationId }, include: { owner: true, contact: true }, orderBy: { createdAt: "desc" } });
}

interface LeadInput {
  fullName: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  notes?: string | null;
  ownerId?: string | null;
}

export function createLead(organizationId: string, data: LeadInput) {
  return db.crmLead.create({ data: { organizationId, ...data } });
}

export function updateLead(organizationId: string, id: string, data: LeadInput & { status?: CrmLeadStatus }) {
  return db.crmLead.update({ where: { id, organizationId }, data });
}

export class LeadAlreadyConvertedError extends Error {}

/**
 * Converts a lead into a deal: creates (or reuses) a CrmContact for the
 * lead's details, creates a CrmDeal linked back to the lead, and marks the
 * lead CONVERTED. A lead can only be converted once (CrmDeal.leadId is
 * unique).
 */
export async function convertLeadToDeal(organizationId: string, leadId: string, data: { title: string; value: string }) {
  const lead = await db.crmLead.findFirst({ where: { id: leadId, organizationId }, include: { convertedDeal: true } });
  if (!lead) throw new Error("Lead not found.");
  if (lead.convertedDeal) throw new LeadAlreadyConvertedError("This lead has already been converted to a deal.");

  return db.$transaction(async (tx) => {
    let contactId = lead.contactId;
    if (!contactId) {
      const contact = await tx.crmContact.create({
        data: {
          organizationId,
          fullName: lead.fullName,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          ownerId: lead.ownerId,
        },
      });
      contactId = contact.id;
    }

    const deal = await tx.crmDeal.create({
      data: {
        organizationId,
        contactId,
        leadId: lead.id,
        title: data.title,
        value: data.value,
        stage: "QUALIFIED",
        ownerId: lead.ownerId,
      },
    });

    await tx.crmLead.update({ where: { id: leadId }, data: { status: "CONVERTED", contactId } });

    return deal;
  });
}

// --- Deals ---

export function listDeals(organizationId: string) {
  return db.crmDeal.findMany({
    where: { organizationId },
    include: { contact: true, owner: true, lead: true },
    orderBy: { createdAt: "desc" },
  });
}

interface DealInput {
  title: string;
  contactId?: string | null;
  value: string;
  expectedCloseDate?: Date | null;
  ownerId?: string | null;
  notes?: string | null;
}

export function createDeal(organizationId: string, data: DealInput) {
  return db.crmDeal.create({ data: { organizationId, ...data, stage: "NEW" } });
}

export function updateDeal(organizationId: string, id: string, data: DealInput) {
  return db.crmDeal.update({ where: { id, organizationId }, data });
}

export function updateDealStage(organizationId: string, id: string, stage: CrmDealStage) {
  const closed = stage === "WON" || stage === "LOST";
  return db.crmDeal.update({
    where: { id, organizationId },
    data: { stage, closedAt: closed ? new Date() : null },
  });
}

// --- Activities ---

export function listActivities(organizationId: string, filter?: { contactId?: string; leadId?: string; dealId?: string }) {
  return db.crmActivity.findMany({
    where: { organizationId, ...filter },
    include: { contact: true, lead: true, deal: true, createdBy: true },
    orderBy: { occurredAt: "desc" },
  });
}

interface ActivityInput {
  type: CrmActivityType;
  subject: string;
  notes?: string | null;
  occurredAt: Date;
  contactId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
  createdById?: string | null;
}

export function createActivity(organizationId: string, data: ActivityInput) {
  return db.crmActivity.create({ data: { organizationId, ...data } });
}

// --- Reports ---

export async function getCrmSummary(organizationId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const deals = await db.crmDeal.findMany({ where: { organizationId } });
  const openDeals = deals.filter((d) => d.stage !== "WON" && d.stage !== "LOST");
  const wonDeals = deals.filter((d) => d.stage === "WON");
  const lostDeals = deals.filter((d) => d.stage === "LOST");
  const wonThisMonth = wonDeals.filter((d) => d.closedAt && d.closedAt >= monthStart);

  const pipelineValue = openDeals.reduce((sum, d) => sum + Number(d.value), 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + Number(d.value), 0);
  const closedCount = wonDeals.length + lostDeals.length;
  const winRate = closedCount > 0 ? (wonDeals.length / closedCount) * 100 : 0;

  const stageCounts = openDeals.reduce<Record<string, number>>((acc, d) => {
    acc[d.stage] = (acc[d.stage] ?? 0) + 1;
    return acc;
  }, {});

  const [contactCount, leadCount, openLeadCount, activityCountThisMonth] = await Promise.all([
    db.crmContact.count({ where: { organizationId } }),
    db.crmLead.count({ where: { organizationId } }),
    db.crmLead.count({ where: { organizationId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } }),
    db.crmActivity.count({ where: { organizationId, occurredAt: { gte: monthStart } } }),
  ]);

  return {
    pipelineValue,
    wonValue,
    winRate,
    wonThisMonthCount: wonThisMonth.length,
    wonThisMonthValue: wonThisMonth.reduce((sum, d) => sum + Number(d.value), 0),
    stageCounts,
    contactCount,
    leadCount,
    openLeadCount,
    activityCountThisMonth,
    openDealCount: openDeals.length,
  };
}
