import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as crm from "@/modules/crm/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres equivalent of test/idor-crm-hr-fleet.test.ts's CRM block —
 * proves the same cross-tenant guards against a real Prisma/Postgres stack
 * instead of a mocked db. Two fully isolated organizations; every
 * cross-organization reference from Org A into a real Org B row must be
 * rejected with crm.NotFoundError, and Org A's list* reads must never
 * surface Org B's rows.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let orgBContactId: string;
let orgBLeadId: string;
let orgBDealId: string;

let orgAContactId: string;
let orgALeadId: string;
let orgADealId: string;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-crm");
  orgB = await createTestOrg("orgB-crm");

  const orgBContact = await crm.createContact(orgB.organizationId, { fullName: "Org B Contact" });
  orgBContactId = orgBContact.id;

  const orgBLead = await crm.createLead(orgB.organizationId, { fullName: "Org B Lead" });
  orgBLeadId = orgBLead.id;

  const orgBDeal = await crm.createDeal(orgB.organizationId, { title: "Org B Deal", value: "100.00" });
  orgBDealId = orgBDeal.id;

  const orgAContact = await crm.createContact(orgA.organizationId, { fullName: "Org A Contact" });
  orgAContactId = orgAContact.id;

  const orgALead = await crm.createLead(orgA.organizationId, { fullName: "Org A Lead" });
  orgALeadId = orgALead.id;

  const orgADeal = await crm.createDeal(orgA.organizationId, { title: "Org A Deal", value: "50.00" });
  orgADealId = orgADeal.id;
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("CRM tenant isolation (real Postgres)", () => {
  it("createContact rejects an ownerId belonging to another organization's member", async () => {
    await expect(
      crm.createContact(orgA.organizationId, { fullName: "Jane", ownerId: orgB.userId }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("updateContact rejects an ownerId belonging to another organization's member", async () => {
    await expect(
      crm.updateContact(orgA.organizationId, orgAContactId, { fullName: "Jane", ownerId: orgB.userId }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("createLead rejects an ownerId belonging to another organization's member", async () => {
    await expect(
      crm.createLead(orgA.organizationId, { fullName: "New Lead", ownerId: orgB.userId }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("updateLead rejects an ownerId belonging to another organization's member", async () => {
    await expect(
      crm.updateLead(orgA.organizationId, orgALeadId, { fullName: "Updated Lead", ownerId: orgB.userId }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("createDeal rejects a contactId belonging to another organization", async () => {
    await expect(
      crm.createDeal(orgA.organizationId, { title: "Cross-tenant deal", value: "100.00", contactId: orgBContactId }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("createDeal rejects an ownerId belonging to another organization's member", async () => {
    await expect(
      crm.createDeal(orgA.organizationId, { title: "Cross-tenant deal", value: "100.00", ownerId: orgB.userId }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("updateDeal rejects a contactId belonging to another organization", async () => {
    await expect(
      crm.updateDeal(orgA.organizationId, orgADealId, { title: "Org A Deal", value: "50.00", contactId: orgBContactId }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("createActivity rejects a contactId belonging to another organization", async () => {
    await expect(
      crm.createActivity(orgA.organizationId, {
        type: "CALL",
        subject: "Follow up",
        occurredAt: new Date(),
        contactId: orgBContactId,
      }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("createActivity rejects a leadId belonging to another organization", async () => {
    await expect(
      crm.createActivity(orgA.organizationId, {
        type: "EMAIL",
        subject: "Follow up",
        occurredAt: new Date(),
        leadId: orgBLeadId,
      }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("createActivity rejects a dealId belonging to another organization", async () => {
    await expect(
      crm.createActivity(orgA.organizationId, {
        type: "MEETING",
        subject: "Follow up",
        occurredAt: new Date(),
        dealId: orgBDealId,
      }),
    ).rejects.toThrow(crm.NotFoundError);
  });

  it("listContacts never returns another organization's contact", async () => {
    const contacts = await crm.listContacts(orgA.organizationId);
    expect(contacts.some((c) => c.id === orgBContactId)).toBe(false);
    expect(contacts.some((c) => c.id === orgAContactId)).toBe(true);
  });

  it("listLeads never returns another organization's lead", async () => {
    const leads = await crm.listLeads(orgA.organizationId);
    expect(leads.some((l) => l.id === orgBLeadId)).toBe(false);
    expect(leads.some((l) => l.id === orgALeadId)).toBe(true);
  });

  it("listDeals never returns another organization's deal", async () => {
    const deals = await crm.listDeals(orgA.organizationId);
    expect(deals.some((d) => d.id === orgBDealId)).toBe(false);
    expect(deals.some((d) => d.id === orgADealId)).toBe(true);
  });

  it("sanity: Org B's contact really exists in the real database, scoped to Org B", async () => {
    const row = await testDb.crmContact.findUnique({ where: { id: orgBContactId } });
    expect(row?.organizationId).toBe(orgB.organizationId);
  });
});
