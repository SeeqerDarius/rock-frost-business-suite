import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireModuleAccess = vi.fn();
const mockHasPermission = vi.fn();
const mockResolveInstallmentAccessScope = vi.fn();

const mockListStaff = vi.fn();
const mockGetInstallmentSettings = vi.fn();
const mockGetEffectiveMonthlySalary = vi.fn();
const mockListAssignableStaffUsers = vi.fn();

const mockListProducts = vi.fn();
const mockListProductCategories = vi.fn();
const mockGetProcurementList = vi.fn();

const mockListCustomers = vi.fn();
const mockListStaffForScope = vi.fn();

const tenant = {
  organizationId: "org-1",
  userId: "user-1",
  enabledModuleKeys: ["installment"],
};

vi.mock("@/lib/auth/module-access", () => ({
  requireModuleAccess: mockRequireModuleAccess,
}));

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: mockHasPermission,
  PERMISSIONS: {
    HIREPURCHASE_STAFF_MANAGE: "hirepurchase.staff.manage",
    HIREPURCHASE_PRODUCTS_MANAGE: "hirepurchase.products.manage",
    HIREPURCHASE_CUSTOMERS_MANAGE: "hirepurchase.customers.manage",
  },
}));

vi.mock("@/modules/installment/access", () => ({
  resolveInstallmentAccessScope: mockResolveInstallmentAccessScope,
}));

vi.mock("@/modules/installment/service", () => ({
  listStaff: mockListStaff,
  getInstallmentSettings: mockGetInstallmentSettings,
  getEffectiveMonthlySalary: mockGetEffectiveMonthlySalary,
  listAssignableStaffUsers: mockListAssignableStaffUsers,
  listProducts: mockListProducts,
  listProductCategories: mockListProductCategories,
  getProcurementList: mockGetProcurementList,
  listCustomers: mockListCustomers,
  listStaffForScope: mockListStaffForScope,
}));

vi.mock("@/app/app/installment/staff/actions", () => ({
  upsertStaff: vi.fn(),
  recordSalaryPayment: vi.fn(),
}));

vi.mock("@/app/app/installment/products/actions", () => ({
  upsertProduct: vi.fn(),
  addProductCategory: vi.fn(),
}));

vi.mock("@/app/app/installment/customers/actions", () => ({
  upsertCustomer: vi.fn(),
}));

const { default: InstallmentStaffPage } = await import("@/app/app/installment/staff/page");
const { default: InstallmentProductsPage } = await import("@/app/app/installment/products/page");
const { default: InstallmentCustomersPage } = await import("@/app/app/installment/customers/page");

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireModuleAccess.mockResolvedValue(tenant);
  mockHasPermission.mockReturnValue(false);
});

describe("installment sensitive page read boundaries", () => {
  it("does not read staff, salary, settings, or assignable users without staff-management permission", async () => {
    await InstallmentStaffPage({ searchParams: Promise.resolve({}) });

    expect(mockRequireModuleAccess).toHaveBeenCalledWith("installment");
    expect(mockHasPermission).toHaveBeenCalledWith(tenant, "hirepurchase.staff.manage");
    expect(mockListStaff).not.toHaveBeenCalled();
    expect(mockGetInstallmentSettings).not.toHaveBeenCalled();
    expect(mockGetEffectiveMonthlySalary).not.toHaveBeenCalled();
    expect(mockListAssignableStaffUsers).not.toHaveBeenCalled();
  });

  it("does not read products, settings, categories, or procurement without product-management permission", async () => {
    await InstallmentProductsPage({ searchParams: Promise.resolve({}) });

    expect(mockRequireModuleAccess).toHaveBeenCalledWith("installment");
    expect(mockHasPermission).toHaveBeenCalledWith(tenant, "hirepurchase.products.manage");
    expect(mockListProducts).not.toHaveBeenCalled();
    expect(mockListProductCategories).not.toHaveBeenCalled();
    expect(mockGetInstallmentSettings).not.toHaveBeenCalled();
    expect(mockGetProcurementList).not.toHaveBeenCalled();
  });

  it("does not read customer or staff data when a field user has no linked staff scope", async () => {
    mockHasPermission.mockReturnValue(true);
    mockResolveInstallmentAccessScope.mockResolvedValue({ kind: "denied" });

    await InstallmentCustomersPage({ searchParams: Promise.resolve({}) });

    expect(mockRequireModuleAccess).toHaveBeenCalledWith("installment");
    expect(mockHasPermission).toHaveBeenCalledWith(tenant, "hirepurchase.customers.manage");
    expect(mockResolveInstallmentAccessScope).toHaveBeenCalledWith(tenant);
    expect(mockListCustomers).not.toHaveBeenCalled();
    expect(mockListStaffForScope).not.toHaveBeenCalled();
  });
});
