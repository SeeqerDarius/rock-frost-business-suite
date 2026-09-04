import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/tenant";
import type { InstallmentAccessScope } from "@/modules/installment/access";

const mockDb = {
  organizationMember: { findMany: vi.fn(), findFirst: vi.fn() },
  hirePurchaseStaff: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  hirePurchaseProduct: { findMany: vi.fn() },
  hirePurchaseStaffInventory: { upsert: vi.fn() },
  hirePurchaseSettings: { findUnique: vi.fn(), create: vi.fn() },
  hirePurchaseCustomer: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findFirstOrThrow: vi.fn(),
  },
  hirePurchaseAccount: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    updateMany: vi.fn(),
  },
  hirePurchasePayment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    aggregate: vi.fn(),
  },
  hirePurchaseCredit: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const { resolveInstallmentAccessScope } = await import("@/modules/installment/access");
const installment = await import("@/modules/installment/service");

const ORG = "org-1";
const STAFF_SCOPE: InstallmentAccessScope = { kind: "staff", staffId: "staff-1" };
const DENIED_SCOPE: InstallmentAccessScope = { kind: "denied" };

function tenant(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: "user-1",
    organizationId: ORG,
    organization: {
      id: ORG,
      name: "Org",
      tenantCode: "ORG",
      industry: null,
      status: "ACTIVE",
    },
    role: "Hire Purchase Staff",
    roleId: "role-1",
    roleIsSystem: true,
    roleOrganizationId: null,
    permissions: ["hirepurchase.view"],
    branch: null,
    enabledModuleKeys: ["installment"],
    accessibleModuleKeys: ["installment"],
    memberships: [{ organizationId: ORG, name: "Org", tenantCode: "ORG" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb));
  mockDb.hirePurchaseSettings.findUnique.mockResolvedValue({
    organizationId: ORG,
    deliveryTimeAfterCompletionDays: 2,
    receiptPrefix: "RCPT",
    staffCodeLength: 3,
    defaultStaffInventoryQuantity: 10,
  });
  mockDb.hirePurchasePayment.findMany.mockResolvedValue([]);
});

describe("Installment access scope resolution", () => {
  it("grants organization scope only to a tenant with staff-management permission", async () => {
    await expect(resolveInstallmentAccessScope(tenant({
      permissions: ["hirepurchase.staff.manage"],
    }))).resolves.toEqual({ kind: "organization" });
    expect(mockDb.hirePurchaseStaff.findMany).not.toHaveBeenCalled();
  });

  it("resolves exactly one active staff login inside the authenticated organization", async () => {
    mockDb.hirePurchaseStaff.findMany.mockResolvedValue([{ id: "staff-1" }]);

    await expect(resolveInstallmentAccessScope(tenant())).resolves.toEqual(STAFF_SCOPE);
    expect(mockDb.hirePurchaseStaff.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, userId: "user-1", active: true },
      select: { id: true },
      take: 2,
    });
  });

  it.each([
    { matches: [] as Array<{ id: string }> },
    { matches: [{ id: "staff-1" }, { id: "staff-duplicate" }] },
  ])(
    "fails closed when the staff login is missing or ambiguous",
    async ({ matches }) => {
      mockDb.hirePurchaseStaff.findMany.mockResolvedValue(matches);
      await expect(resolveInstallmentAccessScope(tenant())).resolves.toEqual(DENIED_SCOPE);
    },
  );
});

describe("Installment service ownership enforcement", () => {
  it("short-circuits denied list access without manufacturing a sentinel id", async () => {
    await expect(installment.listCustomers(ORG, DENIED_SCOPE)).resolves.toEqual([]);
    expect(mockDb.hirePurchaseCustomer.findMany).not.toHaveBeenCalled();
  });

  it("scopes accounts through the canonical customer.staffId relation", async () => {
    mockDb.hirePurchaseAccount.findMany.mockResolvedValue([]);
    await installment.listAccounts(ORG, STAFF_SCOPE);

    expect(mockDb.hirePurchaseAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG, customer: { staffId: "staff-1" } },
    }));
  });

  it("returns only non-sensitive staff selector fields", async () => {
    mockDb.hirePurchaseStaff.findMany.mockResolvedValue([]);
    await installment.listStaffForScope(ORG, STAFF_SCOPE);

    expect(mockDb.hirePurchaseStaff.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: "staff-1", active: true },
      select: { id: true, fullName: true, code: true },
      orderBy: { fullName: "asc" },
    });
  });

  it("rejects assigning a field-created customer to another staff profile", async () => {
    mockDb.hirePurchaseStaff.findFirst.mockResolvedValue(null);

    await expect(installment.createCustomer(ORG, STAFF_SCOPE, {
      fullName: "Foreign assignment",
      staffId: "staff-2",
    })).rejects.toThrow(installment.NotFoundError);
    expect(mockDb.hirePurchaseStaff.findFirst).toHaveBeenCalledWith({
      where: {
        id: "staff-2",
        organizationId: ORG,
        active: true,
        AND: { id: "staff-1", active: true },
      },
    });
    expect(mockDb.hirePurchaseCustomer.create).not.toHaveBeenCalled();
  });

  it("checks account ownership inside the payment transaction", async () => {
    mockDb.hirePurchaseAccount.findFirst.mockResolvedValue(null);

    await expect(installment.recordPayment(ORG, STAFF_SCOPE, {
      accountId: "account-foreign",
      amount: "10.00",
      paymentDate: new Date(),
      method: "Cash",
    })).rejects.toThrow(installment.NotFoundError);
    expect(mockDb.hirePurchaseAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: "account-foreign",
        organizationId: ORG,
        AND: { customer: { staffId: "staff-1" } },
      },
    });
    expect(mockDb.hirePurchasePayment.create).not.toHaveBeenCalled();
  });

  it("applies staff ownership to credit mutations and returns generic not-found", async () => {
    mockDb.hirePurchaseCredit.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      installment.markCreditRefunded(ORG, STAFF_SCOPE, "credit-foreign", "collector"),
    ).rejects.toThrow(installment.NotFoundError);
    expect(mockDb.hirePurchaseCredit.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "credit-foreign",
        organizationId: ORG,
        status: "OPEN",
        AND: { customer: { staffId: "staff-1" } },
      },
    }));
  });

  it("scopes both expected and actual collection activity", async () => {
    mockDb.hirePurchaseAccount.findMany.mockResolvedValue([]);
    mockDb.hirePurchasePayment.aggregate.mockResolvedValue({ _sum: { amount: null } });

    await installment.getActivityReport(ORG, STAFF_SCOPE);

    expect(mockDb.hirePurchaseAccount.findMany).toHaveBeenLastCalledWith({
      where: { organizationId: ORG, customer: { staffId: "staff-1" } },
    });
    for (const [query] of mockDb.hirePurchasePayment.aggregate.mock.calls) {
      expect(query.where).toEqual(expect.objectContaining({
        organizationId: ORG,
        account: { customer: { staffId: "staff-1" } },
      }));
    }
  });
});

describe("Installment staff login linkage", () => {
  it("requires the selected login to be an active member with an active user", async () => {
    mockDb.organizationMember.findFirst.mockResolvedValue(null);

    await expect(installment.createStaff(ORG, {
      fullName: "Collector",
      monthlySalary: "1000.00",
      code: "COL",
      userId: "user-2",
    })).rejects.toThrow(installment.InvalidStaffLoginError);
    expect(mockDb.organizationMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        userId: "user-2",
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      select: { id: true },
    });
  });

  it("maps only the organization/user composite unique conflict to a friendly error", async () => {
    mockDb.organizationMember.findFirst.mockResolvedValue({ id: "member-1" });
    mockDb.hirePurchaseStaff.create.mockRejectedValue(Object.assign(new Error("unique"), {
      code: "P2002",
      meta: { target: ["organizationId", "userId"] },
    }));

    await expect(installment.createStaff(ORG, {
      fullName: "Collector",
      monthlySalary: "1000.00",
      code: "COL",
      userId: "user-2",
    })).rejects.toThrow(installment.StaffLoginAlreadyLinkedError);
  });

  it("returns safe assignable-user DTOs from active organization memberships", async () => {
    mockDb.organizationMember.findMany.mockResolvedValue([
      { user: { id: "user-1", name: "Collector", email: "collector@example.com" } },
    ]);

    await expect(installment.listAssignableStaffUsers(ORG)).resolves.toEqual([
      { id: "user-1", name: "Collector", email: "collector@example.com" },
    ]);
    expect(mockDb.organizationMember.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        role: { rolePermissions: { some: { permission: { key: { startsWith: "hirepurchase." } } } } },
      },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    });
  });
});
