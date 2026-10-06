import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mockAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockAudit }));

const mockDb = {
  organization: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  accountingJournalEntry: { count: vi.fn() },
  accountingInvoice: { count: vi.fn() },
  accountingBill: { count: vi.fn() },
  accountingTaxTransaction: { count: vi.fn() },
  exchangeRate: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};
vi.mock("@/lib/db", () => ({ db: mockDb }));

const settings = await import("@/modules/globalization/organization-localization");
const rates = await import("@/modules/globalization/exchange-rates");

const ORG = "org-a";
const ACTOR = "user-a";

const current = {
  id: ORG, name: "Accra Logistics", legalName: "Accra Logistics Ltd", tradingName: null, country: "GH", region: "Greater Accra",
  city: "Accra", address: null, postalCode: null, legalEntityType: null, taxNumber: "C0001234567", vatRegistrationNumber: null,
  businessRegistrationNumber: null, currency: "GHS", fiscalYearStartMonth: 1, accountingBasis: "ACCRUAL", timezone: "Africa/Accra",
  locale: null, dateFormat: "LOCALE", numberFormat: "LOCALE", defaultLanguage: "en", pricesIncludeTax: false, jurisdictionCode: "GH",
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    legalName: "Accra Logistics Ltd", tradingName: "", country: "GH", region: "Greater Accra", city: "Accra", address: "", postalCode: "",
    legalEntityType: null, taxNumber: "C0001234567", vatRegistrationNumber: "", businessRegistrationNumber: "", currency: "GHS",
    fiscalYearStartMonth: 1, accountingBasis: "ACCRUAL" as const, timezone: "Africa/Accra", locale: "en-GH", dateFormat: "LOCALE" as const,
    numberFormat: "LOCALE" as const, defaultLanguage: "en" as const, pricesIncludeTax: false, ...overrides,
  };
}

function history(counts: { journals?: number; invoices?: number; bills?: number; tax?: number } = {}) {
  mockDb.accountingJournalEntry.count.mockResolvedValue(counts.journals ?? 0);
  mockDb.accountingInvoice.count.mockResolvedValue(counts.invoices ?? 0);
  mockDb.accountingBill.count.mockResolvedValue(counts.bills ?? 0);
  mockDb.accountingTaxTransaction.count.mockResolvedValue(counts.tax ?? 0);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
  mockDb.organization.findUniqueOrThrow.mockResolvedValue({ ...current });
  mockDb.organization.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data }));
  history();
});

describe("organization localization settings", () => {
  it("scopes every read and write to the organization passed by the server", async () => {
    await settings.updateLocalizationSettings(ORG, ACTOR, input({ locale: "en-US" }));
    expect(mockDb.organization.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG } }));
    expect(mockDb.organization.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG } }));
    // Serialized per organization.
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });

  it("refuses to change the base currency once accounting records exist", async () => {
    history({ journals: 3, invoices: 1 });
    await expect(settings.updateLocalizationSettings(ORG, ACTOR, input({ currency: "USD", confirmBaseCurrencyChange: true }))).rejects.toBeInstanceOf(settings.BaseCurrencyLockedError);
    expect(mockDb.organization.update).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before changing the base currency of an empty ledger", async () => {
    await expect(settings.updateLocalizationSettings(ORG, ACTOR, input({ currency: "USD" }))).rejects.toThrow(/Confirm/);
    const result = await settings.updateLocalizationSettings(ORG, ACTOR, input({ currency: "USD", confirmBaseCurrencyChange: true }));
    expect(result.changed).toContain("currency");
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "organization.base_currency_changed", organizationId: ORG }), mockDb);
  });

  it("derives the jurisdiction from the country and requires confirmation when tax history exists", async () => {
    history({ tax: 12 });
    await expect(settings.updateLocalizationSettings(ORG, ACTOR, input({ country: "DE", currency: "GHS", timezone: "Europe/Berlin" }))).rejects.toThrow(/jurisdiction/i);
    const result = await settings.updateLocalizationSettings(ORG, ACTOR, input({ country: "DE", timezone: "Europe/Berlin", confirmJurisdictionChange: true }));
    expect(mockDb.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ country: "DE", jurisdictionCode: "EU-DE" }) }));
    expect(result.changed).toEqual(expect.arrayContaining(["country", "jurisdictionCode", "timezone"]));
  });

  it("allows an admin to override suggested defaults such as timezone and number format", async () => {
    const result = await settings.updateLocalizationSettings(ORG, ACTOR, input({ timezone: "Europe/London", numberFormat: "DOT_COMMA", dateFormat: "YMD" }));
    expect(result.changed).toEqual(expect.arrayContaining(["timezone", "numberFormat", "dateFormat"]));
  });

  it("rejects invalid identifiers before touching the database", async () => {
    await expect(settings.updateLocalizationSettings(ORG, ACTOR, input({ currency: "XXQ" }))).rejects.toBeInstanceOf(settings.LocalizationSettingsError);
    await expect(settings.updateLocalizationSettings(ORG, ACTOR, input({ timezone: "Mars/Base" }))).rejects.toBeInstanceOf(settings.LocalizationSettingsError);
    await expect(settings.updateLocalizationSettings(ORG, ACTOR, input({ fiscalYearStartMonth: 13 }))).rejects.toBeInstanceOf(settings.LocalizationSettingsError);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("masks tax identifiers in the audit trail", async () => {
    await settings.updateLocalizationSettings(ORG, ACTOR, input({ taxNumber: "C0009998887" }));
    const metadata = mockAudit.mock.calls[0][0].metadata as { changes: Record<string, { from: string; to: string }> };
    expect(metadata.changes.taxNumber).toEqual({ from: "****4567", to: "****8887" });
  });

  it("writes nothing and audits nothing when no value changed", async () => {
    mockDb.organization.findUniqueOrThrow.mockResolvedValue({ ...current, locale: "en-GH" });
    const unchanged = await settings.updateLocalizationSettings(ORG, ACTOR, input());
    expect(unchanged.changed).toEqual([]);
    expect(mockDb.organization.update).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("exchange rates", () => {
  it("returns 1 for the base currency without a database lookup", async () => {
    const rate = await rates.resolveExchangeRate(ORG, "GHS", "GHS", "2026-10-01");
    expect(rate.rate.toString()).toBe("1");
    expect(rate.source).toBe("BASE");
    expect(mockDb.exchangeRate.findFirst).not.toHaveBeenCalled();
  });

  it("uses the latest tenant rate on or before the document date, newest correction first", async () => {
    mockDb.exchangeRate.findFirst.mockResolvedValueOnce({ id: "rate-1", rate: new Prisma.Decimal("15.25"), rateDate: new Date("2026-09-30T00:00:00Z"), source: "MANUAL" });
    const rate = await rates.resolveExchangeRate(ORG, "usd", "ghs", "2026-10-01");
    expect(rate).toMatchObject({ fromCurrency: "USD", toCurrency: "GHS", source: "MANUAL", exchangeRateId: "rate-1" });
    expect(mockDb.exchangeRate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG, fromCurrency: "USD", toCurrency: "GHS", rateDate: { lte: new Date("2026-10-01T00:00:00.000Z") } },
      orderBy: [{ rateDate: "desc" }, { createdAt: "desc" }],
    }));
  });

  it("inverts a rate recorded in the opposite direction", async () => {
    mockDb.exchangeRate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "rate-2", rate: new Prisma.Decimal("0.08"), rateDate: new Date("2026-09-01T00:00:00Z"), source: "MANUAL" });
    const rate = await rates.resolveExchangeRate(ORG, "USD", "GHS", "2026-10-01");
    expect(rate.rate.toString()).toBe("12.5");
    expect(rate.source).toBe("INVERTED");
  });

  it("fails clearly when no rate exists instead of guessing", async () => {
    mockDb.exchangeRate.findFirst.mockResolvedValue(null);
    await expect(rates.resolveExchangeRate(ORG, "EUR", "GHS", "2026-10-01")).rejects.toThrow(/No EUR to GHS exchange rate/);
  });

  it("appends corrections instead of overwriting and audits the previous rate", async () => {
    mockDb.exchangeRate.findFirst.mockResolvedValue({ id: "rate-old", rate: new Prisma.Decimal("15.10") });
    mockDb.exchangeRate.create.mockResolvedValue({ id: "rate-new" });
    await rates.recordExchangeRate({ organizationId: ORG, actorId: ACTOR, fromCurrency: "USD", toCurrency: "GHS", rate: "15.20", rateDate: "2026-10-01" });
    expect(mockDb.exchangeRate.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: ORG, fromCurrency: "USD", toCurrency: "GHS", source: "MANUAL", createdById: ACTOR }) });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "exchange_rate.corrected", metadata: expect.objectContaining({ previousRate: "15.1", supersedesId: "rate-old" }) }), mockDb);
  });

  it("rejects same-currency pairs and invalid rates", async () => {
    await expect(rates.recordExchangeRate({ organizationId: ORG, actorId: ACTOR, fromCurrency: "GHS", toCurrency: "GHS", rate: "1", rateDate: "2026-10-01" })).rejects.toThrow(/different currencies/);
    await expect(rates.recordExchangeRate({ organizationId: ORG, actorId: ACTOR, fromCurrency: "USD", toCurrency: "GHS", rate: "-2", rateDate: "2026-10-01" })).rejects.toThrow(/greater than zero/);
    expect(mockDb.exchangeRate.create).not.toHaveBeenCalled();
  });

  it("lists only the requesting organization's rates with bounded pagination", async () => {
    mockDb.exchangeRate.findMany.mockResolvedValue([]);
    mockDb.exchangeRate.count.mockResolvedValue(0);
    await rates.listExchangeRates(ORG, { page: 2, pageSize: 500 });
    expect(mockDb.exchangeRate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG }, skip: 100, take: 100 }));
  });
});
