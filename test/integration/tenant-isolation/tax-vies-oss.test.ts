import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as accounting from "@/modules/accounting/service";
import { provisionJurisdictionPack } from "@/modules/tax/service";
import { getOssReturn, getTaxReport } from "@/modules/tax/reports";
import { latestVatChecks, recheckContactVatNumber, recordVatCheck, VatCheckError } from "@/modules/tax/vat-checks";
import { formatOnlyVatProvider } from "@/modules/tax/providers";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let de: TestOrg;
let gh: TestOrg;
const line = (unitPrice: string) => [{ description: "Digital service", quantity: "1", unitPrice }];
const ruleId = async (orgId: string, code: string) => (await testDb.taxRule.findFirstOrThrow({ where: { organizationId: orgId, code } })).id;

beforeAll(async () => {
  de = await createTestOrg("tax-oss-de");
  gh = await createTestOrg("tax-oss-gh");
  await testDb.organization.update({ where: { id: de.organizationId }, data: { currency: "EUR", country: "DE", jurisdictionCode: "EU-DE", timezone: "Europe/Berlin", taxNumber: "DE123456789" } });
  await testDb.organization.update({ where: { id: gh.organizationId }, data: { currency: "GHS", country: "GH", jurisdictionCode: "GH" } });
  await provisionJurisdictionPack(de.organizationId, "EU", de.userId);
  await accounting.ensureDefaultAccounts(de.organizationId);
}, 120_000);

afterEach(() => {
  delete process.env.VIES_ENABLED;
});

afterAll(async () => {
  await cleanupTestOrg(de);
  await cleanupTestOrg(gh);
});

describe("OSS return worksheet (real Postgres)", () => {
  it("lists B2C supplies by member state of consumption and rate, net of settled credit notes, and excludes domestic and B2B sales", async () => {
    const domestic = await accounting.createInvoice(de.organizationId, { customerName: "Hamburg GmbH", lines: line("100.00"), issueDate: new Date("2026-11-03"), dueDate: new Date("2026-12-03"), taxRuleId: await ruleId(de.organizationId, "EU-DE-STANDARD") }, de.userId);
    const b2b = await accounting.createInvoice(de.organizationId, { customerName: "Paris SAS", lines: line("1000.00"), issueDate: new Date("2026-11-04"), dueDate: new Date("2026-12-04"), taxRuleId: await ruleId(de.organizationId, "EU-DE-INTRA-B2B-RC") }, de.userId);
    const france = await accounting.createInvoice(de.organizationId, { customerName: "Lyon consumer", lines: line("50.00"), issueDate: new Date("2026-11-05"), dueDate: new Date("2026-12-05"), taxRuleId: await ruleId(de.organizationId, "EU-FR-OSS-B2C") }, de.userId);
    const france2 = await accounting.createInvoice(de.organizationId, { customerName: "Nice consumer", lines: line("30.00"), issueDate: new Date("2026-11-06"), dueDate: new Date("2026-12-06"), taxRuleId: await ruleId(de.organizationId, "EU-FR-OSS-B2C") }, de.userId);
    const italy = await accounting.createInvoice(de.organizationId, { customerName: "Rome consumer", lines: line("100.00"), issueDate: new Date("2026-11-07"), dueDate: new Date("2026-12-07"), taxRuleId: await ruleId(de.organizationId, "EU-IT-OSS-B2C") }, de.userId);
    for (const invoice of [domestic, b2b, france, france2, italy]) await accounting.markInvoiceSent(de.organizationId, invoice.id);
    // A refund to a French consumer reduces the French OSS amount in the period it is settled.
    const credit = await accounting.createCreditNote(de.organizationId, { customerName: "Lyon consumer", lines: line("10.00"), issueDate: new Date("2026-11-10"), taxRuleId: await ruleId(de.organizationId, "EU-FR-OSS-B2C"), pricesIncludeTax: false }, de.userId);
    await accounting.applyCreditNoteToInvoice(de.organizationId, credit.id, france.id, de.userId);

    // Credit notes post on the day they are settled, so the period spans today and the invoice dates.
    const worksheet = await getOssReturn(de.organizationId, { from: "2026-01-01", to: "2030-12-31" });
    expect(worksheet).toMatchObject({ established: true, homeMemberState: "DE", baseCurrency: "EUR" });
    const fr = worksheet.rows.find((row) => row.memberState === "FR")!;
    const it = worksheet.rows.find((row) => row.memberState === "IT")!;
    expect(fr.rate.toString()).toBe("20");
    expect(fr.taxableAmount.toFixed(2)).toBe("70.00"); // 50 + 30 - 10
    expect(fr.vatAmount.toFixed(2)).toBe("14.00");
    expect(it.vatAmount.toFixed(2)).toBe("22.00");
    expect(worksheet.rows.some((row) => row.memberState === "DE")).toBe(false);
    expect(worksheet.totalVat.toFixed(2)).toBe("36.00");
  }, 90_000);

  it("explains that OSS needs an EU establishment", async () => {
    expect(await getOssReturn(gh.organizationId, { from: "2026-11-01", to: "2026-11-30" })).toMatchObject({ established: false, rows: [] });
  });

  it("counts settled credit notes as reduced sales in the jurisdiction report", async () => {
    const invoice = await accounting.createInvoice(de.organizationId, { customerName: "Bremen AG", lines: line("200.00"), issueDate: new Date("2026-11-12"), dueDate: new Date("2026-12-12"), taxRuleId: await ruleId(de.organizationId, "EU-DE-STANDARD") }, de.userId);
    await accounting.markInvoiceSent(de.organizationId, invoice.id);
    const before = (await getTaxReport(de.organizationId, { from: "2026-01-01", to: "2030-12-31", view: "jurisdiction" })).rows.find((row) => row.key === "EU-DE")!;
    const credit = await accounting.createCreditNote(de.organizationId, { customerName: "Bremen AG", lines: line("50.00"), issueDate: new Date("2026-11-13"), taxRuleId: await ruleId(de.organizationId, "EU-DE-STANDARD"), pricesIncludeTax: false }, de.userId);
    await accounting.applyCreditNoteToInvoice(de.organizationId, credit.id, invoice.id, de.userId);
    const after = (await getTaxReport(de.organizationId, { from: "2026-01-01", to: "2030-12-31", view: "jurisdiction" })).rows.find((row) => row.key === "EU-DE")!;
    expect(before.taxableSales.minus(after.taxableSales).toFixed(2)).toBe("50.00");
    expect(after.netPayable.minus(before.netPayable).toFixed(2)).toBe("-9.50");
  }, 90_000);
});

describe("VAT number evidence (real Postgres)", () => {
  it("stores each check on the contact, using the organization's own VAT number as the VIES requester", async () => {
    const contact = await accounting.createContact(de.organizationId, { type: "CUSTOMER", name: "Paris SAS", countryCode: "FR", vatNumber: "FR12345678901" }, de.userId);
    process.env.VIES_ENABLED = "true";
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ valid: true, name: "PARIS SAS", address: "1 RUE DE PARIS", requestIdentifier: "WAPI-CONSULT-1" }), { status: 200 }));
    const check = await recheckContactVatNumber(de.organizationId, de.userId, contact.id, fetchImpl as unknown as typeof fetch);
    expect(check).toMatchObject({ level: "REGISTRY", status: "VALID", provider: "vies", registeredName: "PARIS SAS", consultationNumber: "WAPI-CONSULT-1", contactId: contact.id });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ countryCode: "FR", vatNumber: "12345678901", requesterMemberStateCode: "DE", requesterNumber: "123456789" });

    // An outage later is recorded as unavailable, not invalid, and is the latest result.
    const outage = vi.fn(async () => new Response(JSON.stringify({ valid: false, userError: "MS_UNAVAILABLE" }), { status: 200 }));
    await recheckContactVatNumber(de.organizationId, de.userId, contact.id, outage as unknown as typeof fetch);
    expect((await latestVatChecks(de.organizationId, [contact.id])).get(contact.id)).toMatchObject({ status: "UNAVAILABLE", level: "FORMAT" });
    expect(await testDb.vatNumberCheck.count({ where: { organizationId: de.organizationId, contactId: contact.id } })).toBe(2);
    expect(await testDb.auditLog.count({ where: { organizationId: de.organizationId, action: "contact.vat_checked", entityId: contact.id } })).toBe(2);
  }, 60_000);

  it("never checks or reads another organization's contact", async () => {
    const contact = await accounting.createContact(de.organizationId, { type: "CUSTOMER", name: "Private", countryCode: "IT", vatNumber: "IT12345678901" }, de.userId);
    await recordVatCheck(de.organizationId, de.userId, contact.id, await formatOnlyVatProvider.validate("IT", "IT12345678901"));
    await expect(recheckContactVatNumber(gh.organizationId, gh.userId, contact.id)).rejects.toThrow(VatCheckError);
    expect((await latestVatChecks(gh.organizationId, [contact.id])).size).toBe(0);
  }, 60_000);
});
