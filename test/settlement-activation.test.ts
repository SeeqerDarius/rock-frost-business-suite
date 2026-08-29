import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  organization: { findUnique: vi.fn() },
  settlementProfile: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  organizationModule: { findMany: vi.fn() },
  organizationMember: { findFirst: vi.fn() },
};
const mockLogAuditEvent = vi.fn();
const mockIsGatewayConfigured = vi.fn();
const mockGetAppOrigin = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/payments", () => ({
  isGatewayConfigured: mockIsGatewayConfigured,
  resolvePaystackAccount: vi.fn(),
  createPaystackSubaccount: vi.fn(),
  updatePaystackSubaccount: vi.fn(),
  initializeTransaction: vi.fn(),
}));
vi.mock("@/lib/app-url", () => ({
  getAppOrigin: mockGetAppOrigin,
  buildTenantAppUrl: vi.fn(() => "https://example.com/callback"),
}));
vi.mock("@/lib/tenant", () => ({ ACTIVE_ORGANIZATION_STATUSES: new Set(["ACTIVE", "TRIAL"]) }));
vi.mock("@/modules/fleet/service", () => ({ submitFleetDriverPayment: vi.fn(), reviewFleetDriverPaymentSubmission: vi.fn() }));
vi.mock("@/lib/accounting-integration", () => ({ postModuleRevenue: vi.fn() }));

const {
  runSettlementReadinessCheck,
  confirmSettlementBeneficiary,
  settlementStatusLabel,
  MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT,
} = await import("@/lib/payments/operational");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settlementStatusLabel", () => {
  it("maps every SettlementProfileStatus (and no profile at all) to its user-facing label", () => {
    expect(settlementStatusLabel(null)).toBe("Not started");
    expect(settlementStatusLabel("PENDING")).toBe("Verification required");
    expect(settlementStatusLabel("VERIFIED")).toBe("Under review");
    expect(settlementStatusLabel("ACTIVE")).toBe("Active");
    expect(settlementStatusLabel("SUSPENDED")).toBe("Restricted");
    expect(settlementStatusLabel("FAILED")).toBe("Failed");
  });
});

describe("confirmSettlementBeneficiary", () => {
  it("transitions PENDING to VERIFIED and audit-logs it", async () => {
    mockDb.settlementProfile.findUnique.mockResolvedValue({ id: "sp-1", status: "PENDING" });
    mockDb.settlementProfile.update.mockResolvedValue({ id: "sp-1", status: "VERIFIED" });

    const result = await confirmSettlementBeneficiary("org-1", "user-1");

    expect(result.status).toBe("VERIFIED");
    expect(mockDb.settlementProfile.update).toHaveBeenCalledWith({ where: { organizationId: "org-1" }, data: { status: "VERIFIED" } });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "settlement_account.beneficiary_confirmed" }));
  });

  it("is idempotent once past PENDING - no re-write, no re-audit", async () => {
    mockDb.settlementProfile.findUnique.mockResolvedValue({ id: "sp-1", status: "ACTIVE" });

    const result = await confirmSettlementBeneficiary("org-1", "user-1");

    expect(result.status).toBe("ACTIVE");
    expect(mockDb.settlementProfile.update).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("throws when no settlement profile has been started for this organization", async () => {
    mockDb.settlementProfile.findUnique.mockResolvedValue(null);
    await expect(confirmSettlementBeneficiary("org-1", "user-1")).rejects.toThrow();
  });
});

describe("runSettlementReadinessCheck", () => {
  function readyFixtures(overrides: { profileStatus?: string; providerSubaccountCode?: string | null; orgStatus?: string; orgCurrency?: string } = {}) {
    mockDb.organization.findUnique.mockResolvedValue({ status: overrides.orgStatus ?? "ACTIVE", currency: overrides.orgCurrency ?? "GHS" });
    mockDb.settlementProfile.findUnique.mockResolvedValue({ status: overrides.profileStatus ?? "VERIFIED", providerSubaccountCode: overrides.providerSubaccountCode ?? "ACCT_123", onlineCollectionsEnabled: false });
    mockIsGatewayConfigured.mockReturnValue(true);
    mockGetAppOrigin.mockReturnValue("https://app.example.com");
  }

  it("reports READY when every check passes: a supported currency, a verified profile, and a supporting enabled module", async () => {
    readyFixtures();
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.overall).toBe("READY");
    expect(report.checks).toHaveLength(7);
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });

  it("fails PAYSTACK_CONFIGURED when the gateway has no secret key configured", async () => {
    readyFixtures();
    mockIsGatewayConfigured.mockReturnValue(false);
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.overall).toBe("NOT_READY");
    expect(report.checks.find((check) => check.key === "PAYSTACK_CONFIGURED")?.passed).toBe(false);
  });

  it("fails WEBHOOK_CONFIGURED when the application's public origin cannot be resolved", async () => {
    readyFixtures();
    mockGetAppOrigin.mockImplementation(() => { throw new Error("not configured"); });
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.checks.find((check) => check.key === "WEBHOOK_CONFIGURED")?.passed).toBe(false);
  });

  it("fails CURRENCY_SUPPORTED for a currency Paystack cannot settle", async () => {
    readyFixtures({ orgCurrency: "XYZ" });
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.checks.find((check) => check.key === "CURRENCY_SUPPORTED")?.passed).toBe(false);
  });

  it("fails ACCOUNT_VERIFIED when no settlement profile exists yet, and while it's still PENDING", async () => {
    mockDb.organization.findUnique.mockResolvedValue({ status: "ACTIVE", currency: "GHS" });
    mockIsGatewayConfigured.mockReturnValue(true);
    mockGetAppOrigin.mockReturnValue("https://app.example.com");

    mockDb.settlementProfile.findUnique.mockResolvedValue(null);
    let report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.checks.find((check) => check.key === "ACCOUNT_VERIFIED")?.passed).toBe(false);

    mockDb.settlementProfile.findUnique.mockResolvedValue({ status: "PENDING", providerSubaccountCode: "ACCT_1" });
    report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.checks.find((check) => check.key === "ACCOUNT_VERIFIED")?.passed).toBe(false);
  });

  it("fails OPERATIONAL_ADAPTER_AVAILABLE when none of the organization's enabled modules integrate with online collections yet", async () => {
    readyFixtures();
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["hr", "accounting"] });
    expect(report.checks.find((check) => check.key === "OPERATIONAL_ADAPTER_AVAILABLE")?.passed).toBe(false);
  });

  it("fails ORGANIZATION_ELIGIBLE for a suspended organization", async () => {
    readyFixtures({ orgStatus: "SUSPENDED" });
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.checks.find((check) => check.key === "ORGANIZATION_ELIGIBLE")?.passed).toBe(false);
  });

  it("fails ORGANIZATION_ELIGIBLE when the requesting actor's own membership is not active", async () => {
    readyFixtures();
    mockDb.organizationMember.findFirst.mockResolvedValue(null);
    const report = await runSettlementReadinessCheck("org-1", { actorId: "user-1", enabledModuleKeys: ["fleet"] });
    expect(report.checks.find((check) => check.key === "ORGANIZATION_ELIGIBLE")?.passed).toBe(false);
  });

  it("promotes a VERIFIED profile straight to ACTIVE only on a full pass, applies the requested enablement, and audit-logs it", async () => {
    readyFixtures({ profileStatus: "VERIFIED" });
    mockDb.settlementProfile.update.mockResolvedValue({ id: "sp-1", status: "ACTIVE", onlineCollectionsEnabled: true });

    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"], enableIfReady: true });

    expect(report.overall).toBe("READY");
    expect(mockDb.settlementProfile.update).toHaveBeenCalledWith({ where: { organizationId: "org-1" }, data: { status: "ACTIVE", onlineCollectionsEnabled: true } });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "settlement_account.activated" }));
  });

  it("never reports READY, and never re-activates, a SUSPENDED (restricted) profile automatically - even though ACCOUNT_VERIFIED still passes", async () => {
    readyFixtures({ profileStatus: "SUSPENDED" });
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.checks.find((check) => check.key === "ACCOUNT_VERIFIED")?.passed).toBe(true);
    expect(report.overall).toBe("NOT_READY");
    expect(mockDb.settlementProfile.update).not.toHaveBeenCalled();
  });

  it("never re-activates a FAILED profile automatically", async () => {
    readyFixtures({ profileStatus: "FAILED" });
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.checks.find((check) => check.key === "ACCOUNT_VERIFIED")?.passed).toBe(false);
    expect(report.overall).toBe("NOT_READY");
    expect(mockDb.settlementProfile.update).not.toHaveBeenCalled();
  });

  it("leaves an already-ACTIVE profile untouched on a repeat check (idempotent, no spurious write)", async () => {
    readyFixtures({ profileStatus: "ACTIVE" });
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(report.overall).toBe("READY");
    expect(mockDb.settlementProfile.update).not.toHaveBeenCalled();
  });

  it("with commit: false, computes and returns the same report but never writes or audit-logs - safe to call from a Server Component's GET render", async () => {
    readyFixtures({ profileStatus: "VERIFIED" });
    const report = await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"], commit: false });
    expect(report.overall).toBe("READY");
    expect(mockDb.settlementProfile.update).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("commit defaults to true when omitted, preserving the original committing behavior for existing callers", async () => {
    readyFixtures({ profileStatus: "VERIFIED" });
    mockDb.settlementProfile.update.mockResolvedValue({ id: "sp-1", status: "ACTIVE", onlineCollectionsEnabled: false });
    await runSettlementReadinessCheck("org-1", { enabledModuleKeys: ["fleet"] });
    expect(mockDb.settlementProfile.update).toHaveBeenCalled();
  });
});

describe("MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT", () => {
  it("only lists modules with a real OperationalPayment integration today, not every module the schema anticipates", () => {
    expect(MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT).toEqual(["fleet"]);
  });
});
