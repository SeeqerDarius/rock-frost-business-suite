import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as accounting from "@/modules/accounting/service";
import { listTaxCodes } from "@/modules/accounting/tax-service";
import { listExchangeRates, recordExchangeRate, resolveExchangeRate } from "@/modules/globalization/exchange-rates";
import { BaseCurrencyLockedError, getLocalizationSettings, updateLocalizationSettings } from "@/modules/globalization/organization-localization";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let orgA: TestOrg;
let orgB: TestOrg;

const usSettings = {
  legalName: "Peachtree Freight LLC", tradingName: "Peachtree Freight", country: "US", region: "GA", city: "Atlanta", address: "1 Peachtree St",
  postalCode: "30303", legalEntityType: "LIMITED_LIABILITY_COMPANY" as const, taxNumber: "12-3456789", vatRegistrationNumber: "", businessRegistrationNumber: "",
  currency: "USD", fiscalYearStartMonth: 1, accountingBasis: "ACCRUAL" as const, timezone: "America/New_York", locale: "en-US",
  dateFormat: "MDY" as const, numberFormat: "LOCALE" as const, defaultLanguage: "en" as const, pricesIncludeTax: false,
};

beforeAll(async () => {
  orgA = await createTestOrg("global-a");
  orgB = await createTestOrg("global-b");
  await testDb.organization.update({ where: { id: orgA.organizationId }, data: { country: "GH", currency: "GHS", jurisdictionCode: "GH", timezone: "Africa/Accra" } });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("exchange rates (real Postgres)", () => {
  it("never resolves or lists another organization's rates", async () => {
    await recordExchangeRate({ organizationId: orgA.organizationId, actorId: orgA.userId, fromCurrency: "USD", toCurrency: "GHS", rate: "15.00", rateDate: "2026-09-01" });
    await expect(resolveExchangeRate(orgB.organizationId, "USD", "GHS", "2026-09-15")).rejects.toThrow(/No USD to GHS/);
    const listed = await listExchangeRates(orgB.organizationId);
    expect(listed.total).toBe(0);
  });

  it("keeps the original rate row when a correction is recorded and resolves by document date", async () => {
    const original = await testDb.exchangeRate.findFirstOrThrow({ where: { organizationId: orgA.organizationId, rateDate: new Date("2026-09-01T00:00:00Z") } });
    await recordExchangeRate({ organizationId: orgA.organizationId, actorId: orgA.userId, fromCurrency: "USD", toCurrency: "GHS", rate: "15.50", rateDate: "2026-09-01" });
    await recordExchangeRate({ organizationId: orgA.organizationId, actorId: orgA.userId, fromCurrency: "USD", toCurrency: "GHS", rate: "16.00", rateDate: "2026-10-01" });

    expect((await resolveExchangeRate(orgA.organizationId, "USD", "GHS", "2026-09-15")).rate.toFixed(2)).toBe("15.50");
    expect((await resolveExchangeRate(orgA.organizationId, "USD", "GHS", "2026-10-02")).rate.toFixed(2)).toBe("16.00");
    expect((await resolveExchangeRate(orgA.organizationId, "GHS", "USD", "2026-10-02")).rate.toFixed(4)).toBe("0.0625");
    await expect(resolveExchangeRate(orgA.organizationId, "USD", "GHS", "2026-08-31")).rejects.toThrow();

    const unchanged = await testDb.exchangeRate.findUniqueOrThrow({ where: { id: original.id } });
    expect(unchanged.rate.toFixed(2)).toBe("15.00");
    const audits = await testDb.auditLog.count({ where: { organizationId: orgA.organizationId, action: { in: ["exchange_rate.recorded", "exchange_rate.corrected"] } } });
    expect(audits).toBe(3);
  });

  it("enforces positive rates and distinct ISO codes in the database itself", async () => {
    await expect(testDb.exchangeRate.create({ data: { organizationId: orgA.organizationId, fromCurrency: "USD", toCurrency: "GHS", rate: "0", rateDate: new Date("2026-09-02") } })).rejects.toThrow();
    await expect(testDb.exchangeRate.create({ data: { organizationId: orgA.organizationId, fromCurrency: "GHS", toCurrency: "GHS", rate: "1", rateDate: new Date("2026-09-02") } })).rejects.toThrow();
  });
});

describe("organization localization (real Postgres)", () => {
  it("onboards a US organization with USD, US formatting, and the US jurisdiction", async () => {
    const result = await updateLocalizationSettings(orgB.organizationId, orgB.userId, { ...usSettings, confirmBaseCurrencyChange: true });
    expect(result.organization).toMatchObject({ currency: "USD", country: "US", jurisdictionCode: "US", timezone: "America/New_York", locale: "en-US" });
    // Organization A is untouched by B's settings.
    const a = await getLocalizationSettings(orgA.organizationId);
    expect(a.organization).toMatchObject({ currency: "GHS", jurisdictionCode: "GH" });
  });

  it("locks the base currency once an invoice exists", async () => {
    await accounting.createInvoice(orgB.organizationId, { customerName: "Atlanta Customer", lines: [{ description: "Freight", quantity: "1", unitPrice: "100.00" }], issueDate: new Date("2026-10-01"), dueDate: new Date("2026-10-31") }, orgB.userId);
    await expect(updateLocalizationSettings(orgB.organizationId, orgB.userId, { ...usSettings, currency: "EUR", confirmBaseCurrencyChange: true })).rejects.toBeInstanceOf(BaseCurrencyLockedError);
    const row = await testDb.organization.findUniqueOrThrow({ where: { id: orgB.organizationId }, select: { currency: true } });
    expect(row.currency).toBe("USD");
  });

  it("onboards an EU organization into its member-state VAT jurisdiction", async () => {
    const orgC = await createTestOrg("global-c");
    try {
      const result = await updateLocalizationSettings(orgC.organizationId, orgC.userId, { ...usSettings, legalName: "Berlin Logistik GmbH", country: "DE", region: "Berlin", city: "Berlin", postalCode: "10115", currency: "EUR", timezone: "Europe/Berlin", locale: "de-DE", dateFormat: "LOCALE", legalEntityType: "PRIVATE_LIMITED_COMPANY", vatRegistrationNumber: "DE123456789", confirmBaseCurrencyChange: true });
      expect(result.organization).toMatchObject({ currency: "EUR", jurisdictionCode: "EU-DE", locale: "de-DE" });
    } finally {
      await cleanupTestOrg(orgC);
    }
  });

  it("keeps Ghana tax codes for a Ghana-jurisdiction organization and none for a US one", async () => {
    const ghana = await listTaxCodes(orgA.organizationId);
    expect(ghana.map((code) => code.code)).toContain("GH-STD-2026");
    const us = await listTaxCodes(orgB.organizationId);
    expect(us.map((code) => code.code)).not.toContain("GH-STD-2026");
  });

  it("rejects an out-of-range fiscal year month at the database level", async () => {
    await expect(testDb.organization.update({ where: { id: orgA.organizationId }, data: { fiscalYearStartMonth: 13 } })).rejects.toThrow();
  });
});
