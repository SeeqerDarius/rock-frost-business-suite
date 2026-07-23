import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class NotFoundError extends Error {}

  return {
    NotFoundError,
    requireModuleAccess: vi.fn(),
    hasPermission: vi.fn(),
    resolveInstallmentAccessScope: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    createAccount: vi.fn(),
    updateAccountDeliveryStatus: vi.fn(),
    setAccountStatus: vi.fn(),
    reactivateAccount: vi.fn(),
    recordPayment: vi.fn(),
    updatePayment: vi.fn(),
    markCreditRefunded: vi.fn(),
    voidCredit: vi.fn(),
    applyCreditToAccount: vi.fn(),
    getServerAuthSession: vi.fn(),
    verifyCurrentPassword: vi.fn(),
    logAuditEvent: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
  };
});

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`redirect:${location}`);
  }
}

vi.mock("@/lib/auth/module-access", () => ({
  requireModuleAccess: mocks.requireModuleAccess,
}));
vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>(
    "@/lib/auth/permissions",
  );
  return { ...actual, hasPermission: mocks.hasPermission };
});
vi.mock("@/modules/installment/access", () => ({
  resolveInstallmentAccessScope: mocks.resolveInstallmentAccessScope,
}));
vi.mock("@/modules/installment/service", () => ({
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  createAccount: mocks.createAccount,
  updateAccountDeliveryStatus: mocks.updateAccountDeliveryStatus,
  setAccountStatus: mocks.setAccountStatus,
  reactivateAccount: mocks.reactivateAccount,
  recordPayment: mocks.recordPayment,
  updatePayment: mocks.updatePayment,
  markCreditRefunded: mocks.markCreditRefunded,
  voidCredit: mocks.voidCredit,
  applyCreditToAccount: mocks.applyCreditToAccount,
  NotFoundError: mocks.NotFoundError,
  InsufficientInventoryError: class InsufficientInventoryError extends Error {},
  ReactivationNotEligibleError: class ReactivationNotEligibleError extends Error {},
  MinimumDepositError: class MinimumDepositError extends Error {},
  PaymentBlockedError: class PaymentBlockedError extends Error {},
  PaymentEditWindowError: class PaymentEditWindowError extends Error {},
  PaymentCreditLockedError: class PaymentCreditLockedError extends Error {},
  CreditNotApplicableError: class CreditNotApplicableError extends Error {},
  InvalidPaymentAmountError: class InvalidPaymentAmountError extends Error {},
}));
vi.mock("@/lib/auth/session", () => ({
  getServerAuthSession: mocks.getServerAuthSession,
}));
vi.mock("@/lib/auth/verify-password", () => ({
  verifyCurrentPassword: mocks.verifyCurrentPassword,
}));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const { upsertCustomer } = await import("@/app/app/installment/customers/actions");
const { createInstallmentAccount } = await import("@/app/app/installment/accounts/actions");
const { createPayment } = await import("@/app/app/installment/payments/actions");

const ORG = "org-1";
const TENANT = { organizationId: ORG, userId: "user-1" };
const STAFF_SCOPE = { kind: "staff" as const, staffId: "staff-1" };

function expectRedirect(result: Promise<void>, location: string) {
  return expect(result).rejects.toMatchObject({ location });
}

function customerForm() {
  const formData = new FormData();
  formData.set("id", "customer-owned-by-another-staff-member");
  formData.set("fullName", "Scoped Customer");
  formData.set("staffId", STAFF_SCOPE.staffId);
  return formData;
}

function accountForm() {
  const formData = new FormData();
  formData.set("customerId", "customer-owned-by-another-staff-member");
  formData.set("productId", "product-1");
  formData.set("inventoryStaffId", STAFF_SCOPE.staffId);
  formData.set("startDate", "2025-01-01");
  return formData;
}

function paymentForm() {
  const formData = new FormData();
  formData.set("accountId", "account-owned-by-another-staff-member");
  formData.set("amount", "100.00");
  formData.set("paymentDate", "2025-01-01");
  formData.set("method", "Cash");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireModuleAccess.mockResolvedValue(TENANT);
  mocks.hasPermission.mockReturnValue(true);
  mocks.resolveInstallmentAccessScope.mockResolvedValue(STAFF_SCOPE);
  mocks.getServerAuthSession.mockResolvedValue({
    user: { id: TENANT.userId, name: "Collector", email: "collector@example.com" },
  });
  mocks.redirect.mockImplementation((location: string) => {
    throw new RedirectSignal(location);
  });
});

describe("installment Server Action ownership boundary", () => {
  it.each([
    {
      label: "customer",
      action: () => upsertCustomer(customerForm()),
      mutation: mocks.updateCustomer,
      redirectTo: "/app/installment/customers?error=staff-unlinked",
    },
    {
      label: "account",
      action: () => createInstallmentAccount(accountForm()),
      mutation: mocks.createAccount,
      redirectTo: "/app/installment/accounts?error=staff-unlinked",
    },
    {
      label: "payment",
      action: () => createPayment(paymentForm()),
      mutation: mocks.recordPayment,
      redirectTo: "/app/installment/payments?error=staff-unlinked",
    },
  ])(
    "stops a $label action before its mutation service when the user has no staff link",
    async ({ action, mutation, redirectTo }) => {
      mocks.resolveInstallmentAccessScope.mockResolvedValue({ kind: "denied" });

      await expectRedirect(action(), redirectTo);

      expect(mocks.requireModuleAccess).toHaveBeenCalledWith("installment");
      expect(mocks.resolveInstallmentAccessScope).toHaveBeenCalledWith(TENANT);
      expect(mutation).not.toHaveBeenCalled();
      expect(mocks.logAuditEvent).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("turns a scoped-service NotFound for a forged account ID into a safe redirect with no side effects", async () => {
    mocks.recordPayment.mockRejectedValue(new mocks.NotFoundError());

    await expectRedirect(
      createPayment(paymentForm()),
      "/app/installment/payments?error=not-found",
    );

    expect(mocks.recordPayment).toHaveBeenCalledWith(
      ORG,
      STAFF_SCOPE,
      expect.objectContaining({
        accountId: "account-owned-by-another-staff-member",
        amount: "100.00",
        method: "Cash",
      }),
    );
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
