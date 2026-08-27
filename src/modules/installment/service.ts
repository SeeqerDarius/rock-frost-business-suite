import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  HirePurchaseAccountStatus,
  HirePurchaseCreditSource,
} from "@prisma/client";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import { formatMoney } from "@/lib/currency";
import type { InstallmentAccessScope } from "@/modules/installment/access";

export type { InstallmentAccessScope } from "@/modules/installment/access";

/**
 * Business logic migrated from the GLV reference implementation
 * (C:\Users\andre\glv-management-system), validated against its actual
 * behavior rather than its (partly unused) settings fields — see
 * docs/DEVELOPMENT_ROADMAP.md's Phase 7 entry and OPERATOR_HANDOFF.md for
 * exactly which GLV settings are wired here vs. left inert like in GLV
 * itself. Every function takes organizationId explicitly and filters on it,
 * per docs/MODULE_BOUNDARIES.md.
 */

// --- Settings ---

const DEFAULT_SETTINGS = {
  installmentDurationDays: 184,
  defaultDailyCollection: "0",
  administrationFeePercent: "0",
  refundDeductionPercent: "32",
  deliveryTimeAfterCompletionDays: 2,
  procurementThresholdPercent: "70",
  paymentEditWindowHours: 3,
  minimumDeposit: "0",
  defaultMonthlySalary: "0",
  defaultStaffInventoryQuantity: 10,
  commissionEnabled: false,
  commissionPercentage: "0",
  payrollDay: 1,
  receiptPrefix: "RCPT",
  customerIdPrefix: "CUST",
  staffCodeLength: 3,
};

export async function getInstallmentSettings(organizationId: string) {
  const existing = await db.hirePurchaseSettings.findUnique({ where: { organizationId } });
  if (existing) return existing;
  return db.hirePurchaseSettings.create({ data: { organizationId, ...DEFAULT_SETTINGS } });
}

export class InvalidSettingsError extends Error {}

const PERCENT_FIELDS = ["refundDeductionPercent", "procurementThresholdPercent", "administrationFeePercent", "commissionPercentage"] as const;
const NON_NEGATIVE_MONEY_FIELDS = ["defaultMonthlySalary", "defaultDailyCollection", "minimumDeposit"] as const;

/**
 * These settings feed directly into real business math (admin fee, refund
 * deduction, commission, minimum deposit, procurement threshold) with no
 * validation at all previously — a negative or >100% value would silently
 * corrupt every calculation that reads it. Percentages must be 0-100;
 * money-like defaults must be non-negative.
 */
export async function updateInstallmentSettings(organizationId: string, data: Record<string, unknown>) {
  for (const field of PERCENT_FIELDS) {
    if (field in data) {
      const value = Number(data[field]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new InvalidSettingsError(`${field} must be between 0 and 100.`);
      }
    }
  }
  for (const field of NON_NEGATIVE_MONEY_FIELDS) {
    if (field in data) {
      const value = Number(data[field]);
      if (!Number.isFinite(value) || value < 0) {
        throw new InvalidSettingsError(`${field} must be zero or a positive number.`);
      }
    }
  }

  await getInstallmentSettings(organizationId); // ensure a row exists
  return db.hirePurchaseSettings.update({ where: { organizationId }, data });
}

export class NotFoundError extends Error {}

function staffOwnershipWhere(scope: InstallmentAccessScope): Prisma.HirePurchaseStaffWhereInput | null {
  if (scope.kind === "denied") return null;
  return scope.kind === "staff" ? { id: scope.staffId, active: true } : {};
}

function customerOwnershipWhere(scope: InstallmentAccessScope): Prisma.HirePurchaseCustomerWhereInput | null {
  if (scope.kind === "denied") return null;
  return scope.kind === "staff" ? { staffId: scope.staffId } : {};
}

function accountOwnershipWhere(scope: InstallmentAccessScope): Prisma.HirePurchaseAccountWhereInput | null {
  if (scope.kind === "denied") return null;
  return scope.kind === "staff" ? { customer: { staffId: scope.staffId } } : {};
}

function paymentOwnershipWhere(scope: InstallmentAccessScope): Prisma.HirePurchasePaymentWhereInput | null {
  if (scope.kind === "denied") return null;
  return scope.kind === "staff" ? { account: { customer: { staffId: scope.staffId } } } : {};
}

function creditOwnershipWhere(scope: InstallmentAccessScope): Prisma.HirePurchaseCreditWhereInput | null {
  if (scope.kind === "denied") return null;
  return scope.kind === "staff" ? { customer: { staffId: scope.staffId } } : {};
}

function requireOwnershipWhere<T>(where: T | null): T {
  if (!where) throw new NotFoundError("Record not found.");
  return where;
}

// --- Code generation ---

function currentYearSuffix() {
  return String(new Date().getFullYear()).slice(-2);
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export async function generateStaffCode(organizationId: string, fullName: string, length: number): Promise<string> {
  const firstWord = fullName.trim().split(/\s+/)[0] ?? "";
  const base = firstWord.replace(/[^a-zA-Z]/g, "").slice(0, length).toUpperCase() || "STAFF";

  const existing = await db.hirePurchaseStaff.findMany({ where: { organizationId }, select: { code: true } });
  const codes = new Set(existing.map((s) => s.code));
  if (!codes.has(base)) return base;

  let suffix = 2;
  while (codes.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

export async function generateCustomerCode(organizationId: string, staffCode: string, prefix: string): Promise<string> {
  const codePrefix = `${stripTrailingSlash(prefix)}/${staffCode}/${currentYearSuffix()}/`;
  const existing = await db.hirePurchaseCustomer.findMany({
    where: { organizationId, customerCode: { startsWith: codePrefix } },
    select: { customerCode: true },
  });

  let max = 0;
  for (const { customerCode } of existing) {
    const suffix = customerCode.slice(codePrefix.length);
    const num = Number.parseInt(suffix, 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }

  return `${codePrefix}${String(max + 1).padStart(3, "0")}`;
}

export async function generateReceiptNo(organizationId: string, prefix: string): Promise<string> {
  const receiptPrefix = `${stripTrailingSlash(prefix)}/${currentYearSuffix()}/`;
  const existing = await db.hirePurchasePayment.findMany({
    where: { organizationId, receiptNo: { startsWith: receiptPrefix } },
    select: { receiptNo: true },
  });

  let max = 0;
  for (const { receiptNo } of existing) {
    const suffix = receiptNo.slice(receiptPrefix.length);
    const num = Number.parseInt(suffix, 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }

  return `${receiptPrefix}${String(max + 1).padStart(6, "0")}`;
}

// --- Product categories ---

export function listProductCategories(organizationId: string) {
  return db.hirePurchaseProductCategory.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });
}

export function createProductCategory(organizationId: string, name: string) {
  return db.hirePurchaseProductCategory.create({ data: { organizationId, name } });
}

export async function updateProductCategory(
  organizationId: string,
  id: string,
  data: { name: string; active: boolean; sortOrder: number },
) {
  const category = await db.hirePurchaseProductCategory.findFirst({ where: { id, organizationId } });
  if (!category) throw new NotFoundError("Product category not found.");
  return db.hirePurchaseProductCategory.update({ where: { id }, data });
}

export async function deleteProductCategory(organizationId: string, id: string) {
  const category = await db.hirePurchaseProductCategory.findFirst({ where: { id, organizationId } });
  if (!category) throw new NotFoundError("Product category not found.");
  const products = await db.hirePurchaseProduct.count({
    where: { organizationId, category: { equals: category.name, mode: "insensitive" } },
  });
  if (products > 0) throw new ProductCategoryInUseError("Move products out of this category before deleting it.");
  await db.hirePurchaseProductCategory.delete({ where: { id } });
}

export class ProductCategoryInUseError extends Error {}

// --- Products ---

export function listProducts(organizationId: string) {
  return db.hirePurchaseProduct.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export class ProductPriceError extends Error {}

interface ProductInput {
  name: string;
  category: string;
  description?: string | null;
  costPrice: string;
  transportCost: string;
  dailyAmount: string;
  duration: number;
}

function computeProductPrice(input: ProductInput) {
  const price = new Prisma.Decimal(input.dailyAmount).times(input.duration);
  if (price.lessThan(input.costPrice)) {
    throw new ProductPriceError("Daily amount × duration cannot be lower than cost price.");
  }
  return price.toFixed(2);
}

export async function createProduct(organizationId: string, input: ProductInput) {
  const price = computeProductPrice(input);
  const settings = await getInstallmentSettings(organizationId);

  return db.$transaction(async (tx) => {
    const product = await tx.hirePurchaseProduct.create({
      data: { organizationId, ...input, price },
    });

    const activeStaff = await tx.hirePurchaseStaff.findMany({ where: { organizationId, active: true } });
    for (const staff of activeStaff) {
      await tx.hirePurchaseStaffInventory.upsert({
        where: { staffId_productId: { staffId: staff.id, productId: product.id } },
        update: {},
        create: {
          organizationId,
          staffId: staff.id,
          productId: product.id,
          quantity: settings.defaultStaffInventoryQuantity,
        },
      });
    }

    return product;
  });
}

export function updateProduct(organizationId: string, id: string, input: ProductInput) {
  const price = computeProductPrice(input);
  return db.hirePurchaseProduct.update({ where: { id, organizationId }, data: { ...input, price } });
}

export async function setProductActive(organizationId: string, id: string, active: boolean) {
  const updated = await db.hirePurchaseProduct.updateMany({ where: { id, organizationId }, data: { active } });
  if (updated.count !== 1) throw new NotFoundError("Product not found.");
}

export class ProductInUseError extends Error {}

export async function deleteProduct(organizationId: string, id: string) {
  const product = await db.hirePurchaseProduct.findFirst({
    where: { id, organizationId },
    select: { id: true, _count: { select: { accounts: true } } },
  });
  if (!product) throw new NotFoundError("Product not found.");
  if (product._count.accounts > 0) {
    throw new ProductInUseError("Deactivate this product instead; it already has customer accounts.");
  }
  await db.$transaction([
    db.hirePurchaseStaffInventory.deleteMany({ where: { organizationId, productId: id } }),
    db.hirePurchaseProduct.delete({ where: { id } }),
  ]);
}

// --- Staff ---

export function listStaff(organizationId: string) {
  return db.hirePurchaseStaff.findMany({ where: { organizationId }, orderBy: { fullName: "asc" } });
}

export async function listStaffForScope(organizationId: string, scope: InstallmentAccessScope) {
  const ownershipWhere = staffOwnershipWhere(scope);
  if (!ownershipWhere) return [];

  return db.hirePurchaseStaff.findMany({
    where: { organizationId, active: true, ...ownershipWhere },
    select: { id: true, fullName: true, code: true },
    orderBy: { fullName: "asc" },
  });
}

export class InvalidStaffLoginError extends Error {}
export class StaffLoginAlreadyLinkedError extends Error {}
export class StaffHasOperationalHistoryError extends Error {}
export class StaffHasPayrollHistoryError extends Error {}

export async function listAssignableStaffUsers(organizationId: string) {
  const memberships = await db.organizationMember.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
    },
    select: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map(({ user }) => user);
}

async function requireActiveStaffLogin(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  organizationId: string,
  userId: string | null,
) {
  if (!userId) return;

  const membership = await tx.organizationMember.findFirst({
    where: {
      organizationId,
      userId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new InvalidStaffLoginError("Select an active user in this organization.");
  }
}

function isStaffLoginUniqueViolation(error: unknown) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "P2002") return false;

  const meta = "meta" in error ? error.meta : undefined;
  const target = meta && typeof meta === "object" && "target" in meta ? meta.target : undefined;
  if (Array.isArray(target)) {
    return target.length === 2 && target.includes("organizationId") && target.includes("userId");
  }
  return typeof target === "string" && target.includes("organizationId") && target.includes("userId");
}

export async function createStaff(
  organizationId: string,
  data: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    monthlySalary: string;
    code?: string | null;
    userId: string | null;
  }
) {
  const settings = await getInstallmentSettings(organizationId);
  const code = data.code || (await generateStaffCode(organizationId, data.fullName, settings.staffCodeLength));

  try {
    return await db.$transaction(async (tx) => {
      await requireActiveStaffLogin(tx, organizationId, data.userId);

      const staff = await tx.hirePurchaseStaff.create({
        data: {
          organizationId,
          code,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          monthlySalary: data.monthlySalary,
          userId: data.userId,
        },
      });

      const activeProducts = await tx.hirePurchaseProduct.findMany({ where: { organizationId, active: true } });
      for (const product of activeProducts) {
        await tx.hirePurchaseStaffInventory.upsert({
          where: { staffId_productId: { staffId: staff.id, productId: product.id } },
          update: {},
          create: {
            organizationId,
            staffId: staff.id,
            productId: product.id,
            quantity: settings.defaultStaffInventoryQuantity,
          },
        });
      }

      return staff;
    });
  } catch (error) {
    if (isStaffLoginUniqueViolation(error)) {
      throw new StaffLoginAlreadyLinkedError("That login is already linked to another staff profile.");
    }
    throw error;
  }
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export async function updateStaff(
  organizationId: string,
  id: string,
  data: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    monthlySalary: string;
    active: boolean;
    userId: string | null;
  }
) {
  const staff = await db.hirePurchaseStaff.findFirst({ where: { id, organizationId } });
  if (!staff) return null;

  const salaryChanged = staff.monthlySalary.toString() !== data.monthlySalary;

  try {
    return await db.$transaction(async (tx) => {
      await requireActiveStaffLogin(tx, organizationId, data.userId);
      const updated = await tx.hirePurchaseStaff.update({ where: { id, organizationId }, data });

      if (salaryChanged) {
        const effectiveMonth = monthStart(new Date());
        await tx.hirePurchaseStaffSalaryHistory.upsert({
          where: { staffId_effectiveMonth: { staffId: id, effectiveMonth } },
          update: { monthlySalary: data.monthlySalary },
          create: { organizationId, staffId: id, monthlySalary: data.monthlySalary, effectiveMonth },
        });
      }

      return updated;
    });
  } catch (error) {
    if (isStaffLoginUniqueViolation(error)) {
      throw new StaffLoginAlreadyLinkedError("That login is already linked to another staff profile.");
    }
    throw error;
  }
}

export async function deactivateStaff(organizationId: string, id: string) {
  const updated = await db.hirePurchaseStaff.updateMany({
    where: { id, organizationId },
    data: { active: false },
  });
  if (updated.count !== 1) throw new NotFoundError("Staff member not found.");
}

export async function deleteStaff(organizationId: string, id: string) {
  return db.$transaction(async (tx) => {
    const staff = await tx.hirePurchaseStaff.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        _count: {
          select: {
            customers: true,
            inventoryAccounts: true,
            salaryPayments: true,
          },
        },
      },
    });
    if (!staff) throw new NotFoundError("Staff member not found.");
    if (staff._count.customers > 0 || staff._count.inventoryAccounts > 0) {
      throw new StaffHasOperationalHistoryError(
        "Staff with customer or account history must be deactivated instead of deleted.",
      );
    }
    if (staff._count.salaryPayments > 0) {
      throw new StaffHasPayrollHistoryError(
        "Staff with salary payment history must be deactivated instead of deleted.",
      );
    }
    await tx.hirePurchaseStaff.delete({ where: { id, organizationId } });
  });
}

export async function recordStaffSalaryPayment(
  organizationId: string,
  data: { staffId: string; amount: string; paymentDate: Date; salaryMonth: Date; notes?: string | null; paidBy?: string | null }
) {
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InvalidPaymentAmountError("Payment amount must be a positive number.");
  }

  const staff = await db.hirePurchaseStaff.findFirst({ where: { id: data.staffId, organizationId } });
  if (!staff) throw new NotFoundError("Staff member not found.");

  return db.hirePurchaseStaffSalaryPayment.create({ data: { organizationId, ...data } });
}

export async function deleteStaffSalaryPayment(organizationId: string, id: string) {
  const deleted = await db.hirePurchaseStaffSalaryPayment.deleteMany({ where: { id, organizationId } });
  if (deleted.count !== 1) throw new NotFoundError("Salary payment not found.");
}

export function listStaffSalaryPayments(organizationId: string, staffId?: string) {
  return db.hirePurchaseStaffSalaryPayment.findMany({
    where: { organizationId, ...(staffId ? { staffId } : {}) },
    orderBy: { paymentDate: "desc" },
  });
}

export async function getEffectiveMonthlySalary(staffId: string, organizationId: string, asOf: Date): Promise<number> {
  const staff = await db.hirePurchaseStaff.findFirst({ where: { id: staffId, organizationId } });
  if (!staff) return 0;

  const asOfMonth = monthStart(asOf);
  const staffStartMonth = monthStart(staff.createdAt);
  if (asOfMonth < staffStartMonth) return 0;

  const history = await db.hirePurchaseStaffSalaryHistory.findMany({
    where: { staffId, organizationId },
    orderBy: { effectiveMonth: "asc" },
  });

  let salary = Number(staff.monthlySalary);
  for (const entry of history) {
    if (entry.effectiveMonth <= asOfMonth) {
      salary = Number(entry.monthlySalary);
    }
  }
  return salary;
}

// --- Staff inventory ---

export function listStaffInventory(organizationId: string, staffId?: string) {
  return db.hirePurchaseStaffInventory.findMany({
    where: { organizationId, ...(staffId ? { staffId } : {}) },
    include: { staff: true, product: true },
  });
}

async function restoreStaffInventory(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  organizationId: string,
  staffId: string,
  productId: string
) {
  await tx.hirePurchaseStaffInventory.upsert({
    where: { staffId_productId: { staffId, productId } },
    update: { quantity: { increment: 1 } },
    create: { organizationId, staffId, productId, quantity: 1 },
  });
}

export async function adjustStaffInventory(organizationId: string, staffId: string, productId: string, quantity: number) {
  const staff = await db.hirePurchaseStaff.findFirst({ where: { id: staffId, organizationId } });
  if (!staff) throw new NotFoundError("Staff member not found.");
  const product = await db.hirePurchaseProduct.findFirst({ where: { id: productId, organizationId } });
  if (!product) throw new NotFoundError("Product not found.");

  return db.hirePurchaseStaffInventory.upsert({
    where: { staffId_productId: { staffId, productId } },
    update: { quantity },
    create: { organizationId, staffId, productId, quantity },
  });
}

// --- Customers ---

export async function listCustomers(organizationId: string, scope: InstallmentAccessScope) {
  const ownershipWhere = customerOwnershipWhere(scope);
  if (!ownershipWhere) return [];

  return db.hirePurchaseCustomer.findMany({
    where: { organizationId, ...ownershipWhere },
    include: { staff: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCustomer(
  organizationId: string,
  scope: InstallmentAccessScope,
  data: { fullName: string; phone?: string | null; address?: string | null; nationalId?: string | null; staffId: string }
) {
  const ownershipWhere = requireOwnershipWhere(staffOwnershipWhere(scope));
  const staff = await db.hirePurchaseStaff.findFirst({
    where: { id: data.staffId, organizationId, active: true, AND: ownershipWhere },
  });
  if (!staff) throw new NotFoundError("Record not found.");

  const settings = await getInstallmentSettings(organizationId);
  const customerCode = await generateCustomerCode(organizationId, staff.code, settings.customerIdPrefix);

  return db.hirePurchaseCustomer.create({ data: { organizationId, customerCode, ...data } });
}

export async function updateCustomer(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
  data: { fullName: string; phone?: string | null; address?: string | null; nationalId?: string | null; staffId: string }
) {
  const customerWhere = requireOwnershipWhere(customerOwnershipWhere(scope));
  const staffWhere = requireOwnershipWhere(staffOwnershipWhere(scope));

  return db.$transaction(async (tx) => {
    const [customer, staff] = await Promise.all([
      tx.hirePurchaseCustomer.findFirst({ where: { id, organizationId, AND: customerWhere } }),
      tx.hirePurchaseStaff.findFirst({
        where: { id: data.staffId, organizationId, active: true, AND: staffWhere },
      }),
    ]);
    if (!customer || !staff) throw new NotFoundError("Record not found.");

    const updated = await tx.hirePurchaseCustomer.updateMany({
      where: { id, organizationId, AND: customerWhere },
      data,
    });
    if (updated.count !== 1) throw new NotFoundError("Record not found.");

    return tx.hirePurchaseCustomer.findFirstOrThrow({
      where: { id, organizationId, AND: customerWhere },
    });
  });
}

export async function bulkReassignCustomers(
  organizationId: string,
  customerIds: string[],
  staffId: string,
) {
  const uniqueIds = Array.from(new Set(customerIds.filter(Boolean)));
  if (uniqueIds.length === 0) throw new NotFoundError("Select at least one customer.");
  return db.$transaction(async (tx) => {
    const [staff, customers] = await Promise.all([
      tx.hirePurchaseStaff.findFirst({ where: { id: staffId, organizationId, active: true } }),
      tx.hirePurchaseCustomer.findMany({
        where: { id: { in: uniqueIds }, organizationId },
        select: { id: true },
      }),
    ]);
    if (!staff || customers.length !== uniqueIds.length) throw new NotFoundError("Staff member or customer not found.");
    return tx.hirePurchaseCustomer.updateMany({
      where: { id: { in: uniqueIds }, organizationId },
      data: { staffId },
    });
  });
}

// --- Accounts ---

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export async function listAccounts(organizationId: string, scope: InstallmentAccessScope) {
  const ownershipWhere = accountOwnershipWhere(scope);
  if (!ownershipWhere) return [];

  return db.hirePurchaseAccount.findMany({
    where: { organizationId, ...ownershipWhere },
    include: { customer: true, product: true, inventoryStaff: true },
    orderBy: { createdAt: "desc" },
  });
}

export class MinimumDepositError extends Error {}

/**
 * `administrationFeePercent` and `minimumDeposit` are real, enforced rules
 * here — unlike GLV, which stores both but never reads either. The admin
 * fee is added on top of the product price as a one-time origination fee;
 * the minimum deposit (if set) must be met by an optional initial payment
 * collected at account opening.
 */
export async function createAccount(
  organizationId: string,
  scope: InstallmentAccessScope,
  data: { customerId: string; productId: string; inventoryStaffId?: string | null; startDate: Date; initialDeposit?: string }
) {
  const customerWhere = requireOwnershipWhere(customerOwnershipWhere(scope));
  const settings = await getInstallmentSettings(organizationId);
  const minimumDeposit = new Prisma.Decimal(settings.minimumDeposit);
  const depositAmount = data.initialDeposit ? new Prisma.Decimal(data.initialDeposit) : new Prisma.Decimal(0);

  if (minimumDeposit.greaterThan(0) && depositAmount.lessThan(minimumDeposit)) {
    throw new MinimumDepositError(`A minimum deposit of ${formatMoney(minimumDeposit)} is required to open this account.`);
  }

  // Regenerated fresh on every retry attempt (not hoisted above the retried
  // operation) so a P2002 collision on receiptNo gets a newly-counted number
  // rather than retrying the transaction with the same doomed value.
  return createWithUniqueRetry(async () => {
    const receiptNo = depositAmount.greaterThan(0) ? await generateReceiptNo(organizationId, settings.receiptPrefix) : null;

    return db.$transaction(async (tx) => {
      const [product, customer, inventoryStaff] = await Promise.all([
        tx.hirePurchaseProduct.findFirst({ where: { id: data.productId, organizationId, active: true } }),
        tx.hirePurchaseCustomer.findFirst({
          where: { id: data.customerId, organizationId, AND: customerWhere },
        }),
        data.inventoryStaffId
          ? tx.hirePurchaseStaff.findFirst({ where: { id: data.inventoryStaffId, organizationId, active: true } })
          : Promise.resolve(true),
      ]);
      if (!product || !customer || !inventoryStaff) {
        throw new NotFoundError("Record not found.");
      }

      // Prisma.Decimal (arbitrary-precision) rather than JS Number
      // arithmetic: these derived values are persisted at account opening.
      const adminFeeRate = new Prisma.Decimal(settings.administrationFeePercent).div(100);
      const productPrice = new Prisma.Decimal(product.price);
      const adminFee = productPrice.times(adminFeeRate);
      const targetAmount = productPrice.plus(adminFee).toFixed(2);
      const dailyAmount = product.dailyAmount;
      const expectedEndDate = addDays(data.startDate, product.duration);

      const account = await tx.hirePurchaseAccount.create({
        data: {
          organizationId,
          customerId: data.customerId,
          productId: data.productId,
          inventoryStaffId: data.inventoryStaffId ?? null,
          startDate: data.startDate,
          expectedEndDate,
          targetAmount,
          dailyAmount,
          totalPaid: 0,
          balance: targetAmount,
          status: "ACTIVE",
          deliveryStatus: "PENDING",
        },
      });

      let depositPayment = null;
      if (depositAmount.greaterThan(0) && receiptNo) {
        const nextBalance = Prisma.Decimal.max(new Prisma.Decimal(targetAmount).minus(depositAmount), 0);
        depositPayment = await tx.hirePurchasePayment.create({
          data: {
            organizationId,
            accountId: account.id,
            receiptNo,
            amount: depositAmount.toFixed(2),
            paymentDate: data.startDate,
            method: "Initial deposit",
            notes: "Deposit collected at account opening",
          },
        });
        await tx.hirePurchaseAccount.update({
          where: { id: account.id },
          data: {
            totalPaid: depositAmount.toFixed(2),
            balance: nextBalance.toFixed(2),
            status: nextBalance.lessThanOrEqualTo(0) ? "COMPLETED" : "ACTIVE",
          },
        });
      }

      return { account, depositPayment };
    });
  });
}

/**
 * OVERDUE is deliberately never stored — GLV computes it only at read time
 * (an account whose stored status is ACTIVE, still has a balance, and is
 * past its expected end date), which avoids a stored/effective inconsistency
 * GLV itself has (OVERDUE appears in a stored-status filter list that no
 * write path ever actually produces).
 */
export function getEffectiveAccountStatus(
  account: { status: HirePurchaseAccountStatus; balance: unknown; expectedEndDate: Date },
  now: Date = new Date()
): HirePurchaseAccountStatus | "OVERDUE" {
  if (account.status === "ACTIVE" && Number(account.balance) > 0 && now > account.expectedEndDate) {
    return "OVERDUE";
  }
  return account.status;
}

export class InvalidAccountPriceError extends Error {}

export async function updateAccountPrice(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
  targetAmountValue: string,
) {
  const accountWhere = requireOwnershipWhere(accountOwnershipWhere(scope));
  const targetAmount = new Prisma.Decimal(targetAmountValue);
  if (!targetAmount.isPositive()) throw new InvalidAccountPriceError("Account price must be greater than zero.");

  return db.$transaction(async (tx) => {
    const account = await tx.hirePurchaseAccount.findFirst({
      where: { id, organizationId, AND: accountWhere },
    });
    if (!account) throw new NotFoundError("Account not found.");

    const balance = Prisma.Decimal.max(targetAmount.minus(account.totalPaid), 0);
    const status: HirePurchaseAccountStatus =
      balance.lessThanOrEqualTo(0) ? "COMPLETED" : account.status === "COMPLETED" ? "ACTIVE" : account.status;
    await tx.hirePurchaseAccount.update({
      where: { id },
      data: { targetAmount: targetAmount.toFixed(2), balance: balance.toFixed(2), status },
    });
    return { previousTargetAmount: account.targetAmount.toString(), targetAmount: targetAmount.toFixed(2) };
  });
}

export async function updateAccountProduct(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
  productId: string,
) {
  const accountWhere = requireOwnershipWhere(accountOwnershipWhere(scope));
  return db.$transaction(async (tx) => {
    const [account, product] = await Promise.all([
      tx.hirePurchaseAccount.findFirst({
        where: { id, organizationId, AND: accountWhere },
        include: { product: true },
      }),
      tx.hirePurchaseProduct.findFirst({ where: { id: productId, organizationId, active: true } }),
    ]);
    if (!account || !product) throw new NotFoundError("Account or product not found.");
    if (account.productId === product.id) return { previousProductId: account.productId, productId };

    const targetAmount = new Prisma.Decimal(product.price);
    const balance = Prisma.Decimal.max(targetAmount.minus(account.totalPaid), 0);
    const overpayment = Prisma.Decimal.max(new Prisma.Decimal(account.totalPaid).minus(targetAmount), 0);
    const status: HirePurchaseAccountStatus =
      balance.lessThanOrEqualTo(0) ? "COMPLETED" : account.status === "COMPLETED" ? "ACTIVE" : account.status;

    await tx.hirePurchaseAccount.update({
      where: { id },
      data: {
        productId,
        targetAmount: targetAmount.toFixed(2),
        dailyAmount: product.dailyAmount,
        expectedEndDate: addDays(account.startDate, product.duration),
        balance: balance.toFixed(2),
        status,
        deliveryStatus: "PENDING",
        deliveredAt: null,
        deliveredBy: null,
      },
    });

    if (overpayment.greaterThan(0)) {
      const existing = await tx.hirePurchaseCredit.aggregate({
        where: { organizationId, accountId: id, status: { not: "VOID" } },
        _sum: { amount: true },
      });
      const additional = Prisma.Decimal.max(overpayment.minus(existing._sum.amount ?? 0), 0);
      if (additional.greaterThan(0)) {
        await tx.hirePurchaseCredit.create({
          data: {
            organizationId,
            customerId: account.customerId,
            accountId: id,
            amount: additional.toFixed(2),
            remainingAmount: additional.toFixed(2),
            source: "MANUAL_ADJUSTMENT",
            notes: `Credit from product correction: ${account.product.name} to ${product.name}`,
          },
        });
      }
    }
    return { previousProductId: account.productId, productId };
  });
}

export async function updateAccountDeliveryStatus(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
  deliveredBy: string,
) {
  const ownershipWhere = requireOwnershipWhere(accountOwnershipWhere(scope));

  return db.$transaction(async (tx) => {
    const account = await tx.hirePurchaseAccount.findFirst({
      where: { id, organizationId, AND: ownershipWhere },
    });
    if (!account) throw new NotFoundError("Record not found.");
    if (account.status !== "COMPLETED" || Number(account.balance) > 0) {
      throw new Error("Only completed, fully-paid accounts can be marked delivered.");
    }

    const updated = await tx.hirePurchaseAccount.updateMany({
      where: {
        id,
        organizationId,
        status: "COMPLETED",
        balance: { lte: 0 },
        AND: ownershipWhere,
      },
      data: { deliveryStatus: "DELIVERED", deliveredAt: new Date(), deliveredBy },
    });
    if (updated.count !== 1) {
      throw new Error("Only completed, fully-paid accounts can be marked delivered.");
    }

    return tx.hirePurchaseAccount.findFirstOrThrow({
      where: { id, organizationId, AND: ownershipWhere },
    });
  });
}

const MANUALLY_SETTABLE_STATUSES: HirePurchaseAccountStatus[] = ["SUSPENDED", "CANCELLED", "ACTIVE"];

/**
 * Cancelling an account restores the reserved unit to the assigned staff's
 * inventory — the customer isn't taking delivery of that unit after all.
 * Suspension is treated as temporary/reversible, so it does not touch stock.
 */
export async function setAccountStatus(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
  status: HirePurchaseAccountStatus,
) {
  const ownershipWhere = requireOwnershipWhere(accountOwnershipWhere(scope));
  if (!MANUALLY_SETTABLE_STATUSES.includes(status)) {
    throw new Error("That status can't be set manually.");
  }

  return db.$transaction(async (tx) => {
    const account = await tx.hirePurchaseAccount.findFirst({
      where: { id, organizationId, AND: ownershipWhere },
    });
    if (!account) throw new NotFoundError("Record not found.");

    const claimed = await tx.hirePurchaseAccount.updateMany({
      where: { id, organizationId, status: account.status, AND: ownershipWhere },
      data: { status },
    });
    if (claimed.count !== 1) throw new NotFoundError("Record not found.");

    if (status === "CANCELLED" && account.status !== "CANCELLED" && account.inventoryStaffId) {
      await restoreStaffInventory(tx, organizationId, account.inventoryStaffId, account.productId);
    }

    return tx.hirePurchaseAccount.findFirstOrThrow({
      where: { id, organizationId, AND: ownershipWhere },
    });
  });
}

// --- Payments ---

export async function listPayments(organizationId: string, scope: InstallmentAccessScope) {
  const ownershipWhere = paymentOwnershipWhere(scope);
  if (!ownershipWhere) return [];

  return db.hirePurchasePayment.findMany({
    where: { organizationId, ...ownershipWhere },
    include: { account: { include: { customer: true, product: true } }, credit: true },
    orderBy: { paymentDate: "desc" },
  });
}

const BLOCKED_PAYMENT_STATUSES: HirePurchaseAccountStatus[] = ["CANCELLED", "SUSPENDED", "CLOSED", "ARCHIVED", "COMPLETED"];

export class PaymentBlockedError extends Error {}
export class InvalidPaymentAmountError extends Error {}

/**
 * totalPaid and balance are updated with one atomic multi-field
 * increment/decrement (a single UPDATE statement), not a JS-computed
 * absolute write from a pre-transaction read — two concurrent payments can
 * never lose one's contribution to the running total. Overpayment is
 * detected from the atomically-decremented balance's true (possibly
 * negative) result, so the credit amount created for the excess is always
 * correct even under concurrent payments on the same account. The
 * subsequent clamp-to-zero + status write reads that same fresh result
 * from within this same transaction — Postgres's row lock from the first
 * UPDATE is held until commit, so no other transaction (a concurrent
 * recordPayment(), applyCreditToAccount(), or recalculateAccountAfter-
 * PaymentChange() call on this same account — all of which now also lock
 * or atomically write this row) can interleave between the two updates
 * below. See docs/HARDENING_PLAN.md's Pass 4 section.
 */
export async function recordPayment(
  organizationId: string,
  scope: InstallmentAccessScope,
  data: { accountId: string; amount: string; paymentDate: Date; method: string; notes?: string | null; receivedBy?: string | null }
) {
  const amount = new Prisma.Decimal(data.amount);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new InvalidPaymentAmountError("Payment amount must be a positive number.");
  }

  const accountWhere = requireOwnershipWhere(accountOwnershipWhere(scope));
  const settings = await getInstallmentSettings(organizationId);

  // The whole transaction attempt is retried on a receipt-number collision
  // (not just the create call), regenerating receiptNo fresh each time.
  return createWithUniqueRetry(async () => {
    const receiptNo = await generateReceiptNo(organizationId, settings.receiptPrefix);

    return db.$transaction(async (tx) => {
      const account = await tx.hirePurchaseAccount.findFirst({
        where: { id: data.accountId, organizationId, AND: accountWhere },
      });
      if (!account) throw new NotFoundError("Record not found.");
      if (BLOCKED_PAYMENT_STATUSES.includes(account.status) || new Prisma.Decimal(account.balance).lessThanOrEqualTo(0)) {
        throw new PaymentBlockedError("This account can't accept new payments in its current state.");
      }

      const payment = await tx.hirePurchasePayment.create({
        data: { organizationId, receiptNo, ...data },
      });

      const claimed = await tx.hirePurchaseAccount.updateMany({
        where: {
          id: account.id,
          organizationId,
          status: { notIn: BLOCKED_PAYMENT_STATUSES },
          balance: { gt: 0 },
          AND: accountWhere,
        },
        data: { totalPaid: { increment: amount.toNumber() }, balance: { decrement: amount.toNumber() } },
      });
      if (claimed.count !== 1) throw new NotFoundError("Record not found.");

      const updated = await tx.hirePurchaseAccount.findFirstOrThrow({
        where: { id: account.id, organizationId, AND: accountWhere },
      });
      const rawBalance = new Prisma.Decimal(updated.balance);
      const isOverpaid = rawBalance.lessThan(0);
      const clampedBalance = Prisma.Decimal.max(rawBalance, 0);

      let nextStatus = updated.status;
      if (rawBalance.lessThanOrEqualTo(0)) {
        nextStatus = "COMPLETED";
      } else if (updated.status === "DORMANT" || updated.status === "PROBATION") {
        nextStatus = "ACTIVE";
      }

      if (isOverpaid || nextStatus !== updated.status) {
        const finalized = await tx.hirePurchaseAccount.updateMany({
          where: { id: account.id, organizationId, AND: accountWhere },
          data: { balance: clampedBalance.toFixed(2), status: nextStatus },
        });
        if (finalized.count !== 1) throw new NotFoundError("Record not found.");
      }

      if (isOverpaid) {
        const creditAmount = rawBalance.abs();
        await tx.hirePurchaseCredit.create({
          data: {
            organizationId,
            customerId: account.customerId,
            accountId: account.id,
            paymentId: payment.id,
            amount: creditAmount.toFixed(2),
            remainingAmount: creditAmount.toFixed(2),
            status: "OPEN",
            source: "PAYMENT_OVERPAYMENT",
            notes: `Overpayment from receipt ${receiptNo}`,
          },
        });
      }

      return payment;
    });
  });
}

export function canEditPayment(payment: { createdAt: Date }, windowHours: number, now: Date = new Date()): boolean {
  const elapsedMs = now.getTime() - payment.createdAt.getTime();
  return elapsedMs >= 0 && elapsedMs <= windowHours * 60 * 60 * 1000;
}

export class PaymentEditWindowError extends Error {}
export class PaymentCreditLockedError extends Error {}

export async function updatePayment(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
  data: { amount: string; paymentDate: Date; method: string; notes?: string | null }
) {
  const paymentWhere = requireOwnershipWhere(paymentOwnershipWhere(scope));
  const settings = await getInstallmentSettings(organizationId);

  return db.$transaction(async (tx) => {
    const payment = await tx.hirePurchasePayment.findFirst({
      where: { id, organizationId, AND: paymentWhere },
      include: { credit: true },
    });
    if (!payment) throw new NotFoundError("Record not found.");

    if (!canEditPayment(payment, settings.paymentEditWindowHours)) {
      throw new PaymentEditWindowError(`This payment can only be edited within ${settings.paymentEditWindowHours} hour(s) of recording.`);
    }

    const amountChanged = payment.amount.toString() !== data.amount;
    if (amountChanged && payment.credit && (payment.credit.status !== "OPEN" || payment.credit.remainingAmount.toString() !== payment.credit.amount.toString())) {
      throw new PaymentCreditLockedError("This payment has a resolved or partially used credit and cannot have its amount edited.");
    }

    const updated = await tx.hirePurchasePayment.updateMany({
      where: { id, organizationId, AND: paymentWhere },
      data,
    });
    if (updated.count !== 1) throw new NotFoundError("Record not found.");

    await recalculateAccountAfterPaymentChange(tx, organizationId, scope, payment.accountId);

    // The original payment snapshot (pre-edit) and the signed amount delta,
    // so the caller can post an amount-correction entry to Accounting — the
    // originally-posted "COLLECTED" entry is never itself edited or
    // reversed (this ledger's postings are immutable once posted; see
    // docs/ACCOUNTING_MODULE.md's "Ledger foundation"), only corrected with
    // a distinct compensating entry, same principle as a full reversal.
    const amountDelta = amountChanged ? new Prisma.Decimal(data.amount).minus(payment.amount).toFixed(2) : null;
    return { payment, amountDelta };
  });
}

export async function deletePayment(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
) {
  const paymentWhere = requireOwnershipWhere(paymentOwnershipWhere(scope));
  return db.$transaction(async (tx) => {
    const payment = await tx.hirePurchasePayment.findFirst({
      where: { id, organizationId, AND: paymentWhere },
      include: { credit: true },
    });
    if (!payment) throw new NotFoundError("Payment not found.");
    if (payment.credit && (payment.credit.status !== "OPEN" || !payment.credit.remainingAmount.equals(payment.credit.amount))) {
      throw new PaymentCreditLockedError("This payment has a resolved or partially used credit and cannot be deleted.");
    }
    if (payment.credit) await tx.hirePurchaseCredit.delete({ where: { id: payment.credit.id } });
    await tx.hirePurchasePayment.delete({ where: { id } });
    await recalculateAccountAfterPaymentChange(tx, organizationId, scope, payment.accountId);
    return payment;
  });
}

async function recalculateAccountAfterPaymentChange(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  organizationId: string,
  scope: InstallmentAccessScope,
  accountId: string
) {
  const accountWhere = requireOwnershipWhere(accountOwnershipWhere(scope));
  const paymentWhere = requireOwnershipWhere(paymentOwnershipWhere(scope));
  const creditWhere = requireOwnershipWhere(creditOwnershipWhere(scope));

  const accessible = await tx.hirePurchaseAccount.findFirst({
    where: { id: accountId, organizationId, AND: accountWhere },
    select: { id: true },
  });
  if (!accessible) throw new NotFoundError("Record not found.");

  // Locks the account row before this function's read-then-absolute-write
  // (a full recompute from every payment, not an increment — inherently
  // can't use the guarded-updateMany pattern) — closes the race where a
  // concurrent recordPayment()/applyCreditToAccount() on the same account
  // could interleave between this read and this function's write. Any
  // other function touching this account row (both of the above already
  // use FOR UPDATE or an atomic increment/decrement) is naturally
  // serialized against this lock by Postgres, not just callers of this
  // specific function.
  await tx.$queryRaw`SELECT id FROM "HirePurchaseAccount" WHERE id = ${accountId} AND "organizationId" = ${organizationId} FOR UPDATE`;

  const account = await tx.hirePurchaseAccount.findFirstOrThrow({
    where: { id: accountId, organizationId, AND: accountWhere },
  });
  const payments = await tx.hirePurchasePayment.findMany({
    where: { accountId, organizationId, AND: paymentWhere },
  });

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const rawBalance = Number(account.targetAmount) - totalPaid;
  const balance = Math.max(rawBalance, 0);
  const isOverpaid = rawBalance < 0;

  let nextStatus = account.status;
  if (rawBalance <= 0) {
    nextStatus = "COMPLETED";
  } else if (account.status === "COMPLETED") {
    nextStatus = "ACTIVE";
  }

  const updated = await tx.hirePurchaseAccount.updateMany({
    where: { id: accountId, organizationId, AND: accountWhere },
    data: { totalPaid: totalPaid.toFixed(2), balance: balance.toFixed(2), status: nextStatus },
  });
  if (updated.count !== 1) throw new NotFoundError("Record not found.");

  const existingCredit = await tx.hirePurchaseCredit.findFirst({
    where: {
      accountId,
      organizationId,
      source: "PAYMENT_OVERPAYMENT",
      status: "OPEN",
      AND: creditWhere,
    },
  });

  if (isOverpaid) {
    const creditAmount = Math.abs(rawBalance);
    if (existingCredit) {
      await tx.hirePurchaseCredit.update({
        where: { id: existingCredit.id },
        data: { amount: creditAmount.toFixed(2), remainingAmount: creditAmount.toFixed(2) },
      });
    } else {
      await tx.hirePurchaseCredit.create({
        data: {
          organizationId,
          customerId: account.customerId,
          accountId,
          amount: creditAmount.toFixed(2),
          remainingAmount: creditAmount.toFixed(2),
          status: "OPEN",
          source: "PAYMENT_OVERPAYMENT",
          notes: "Adjusted after payment edit",
        },
      });
    }
  } else if (existingCredit) {
    await tx.hirePurchaseCredit.delete({ where: { id: existingCredit.id } });
  }
}

// --- Credits ---

export async function listCredits(organizationId: string, scope: InstallmentAccessScope) {
  const ownershipWhere = creditOwnershipWhere(scope);
  if (!ownershipWhere) return [];

  return db.hirePurchaseCredit.findMany({
    where: { organizationId, ...ownershipWhere },
    include: { customer: true, account: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function markCreditRefunded(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
  resolvedBy: string,
) {
  const ownershipWhere = requireOwnershipWhere(creditOwnershipWhere(scope));
  const result = await db.hirePurchaseCredit.updateMany({
    where: { id, organizationId, status: "OPEN", AND: ownershipWhere },
    data: { status: "REFUNDED", remainingAmount: 0, resolvedBy, resolvedAt: new Date() },
  });
  if (result.count !== 1) throw new NotFoundError("Record not found.");
  return result;
}

export async function voidCredit(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
  resolvedBy: string,
) {
  const ownershipWhere = requireOwnershipWhere(creditOwnershipWhere(scope));
  const result = await db.hirePurchaseCredit.updateMany({
    where: { id, organizationId, status: "OPEN", AND: ownershipWhere },
    data: { status: "VOID", remainingAmount: 0, resolvedBy, resolvedAt: new Date() },
  });
  if (result.count !== 1) throw new NotFoundError("Record not found.");
  return result;
}

export class CreditNotApplicableError extends Error {}

/**
 * Applies an OPEN credit toward another account belonging to the same
 * customer, reducing that account's balance as if it were a payment. GLV
 * has no reference implementation for this — the `APPLIED` status exists in
 * its schema but no code path there ever sets it. Designed fresh here:
 * partial application is allowed (a credit larger than the target
 * account's balance only applies up to that balance, leaving the rest
 * OPEN), recorded as a real payment row so the account's totalPaid stays
 * consistent with "sum of its payments."
 */
type LockedCreditRow = {
  id: string;
  customerId: string;
  status: string;
  remainingAmount: Prisma.Decimal | string;
  source: string;
};
type LockedAccountRow = {
  id: string;
  customerId: string;
  balance: Prisma.Decimal | string;
  totalPaid: Prisma.Decimal | string;
  status: HirePurchaseAccountStatus;
};

/**
 * Every read this function needs (the credit, the target account) now
 * happens inside the transaction against rows locked with
 * `SELECT ... FOR UPDATE`, not a pre-transaction snapshot — closing the
 * previously-documented race where a concurrent recordPayment() or a
 * second applyCreditToAccount() call on the same account/credit could
 * interleave between the read and this function's absolute write. See
 * docs/HARDENING_PLAN.md's Pass 4 section.
 */
export async function applyCreditToAccount(
  organizationId: string,
  scope: InstallmentAccessScope,
  creditId: string,
  targetAccountId: string,
) {
  const creditWhere = requireOwnershipWhere(creditOwnershipWhere(scope));
  const accountWhere = requireOwnershipWhere(accountOwnershipWhere(scope));
  const settings = await getInstallmentSettings(organizationId);

  // Regenerated fresh on every retry attempt, same reasoning as
  // createAccount()'s deposit receipt above — a P2002 collision on
  // receiptNo must get a newly-counted number, not the same doomed one.
  return createWithUniqueRetry(async () => {
    const receiptNo = await generateReceiptNo(organizationId, settings.receiptPrefix);

    return db.$transaction(async (tx) => {
      const [accessibleCredit, accessibleAccount] = await Promise.all([
        tx.hirePurchaseCredit.findFirst({
          where: { id: creditId, organizationId, AND: creditWhere },
          select: { id: true },
        }),
        tx.hirePurchaseAccount.findFirst({
          where: { id: targetAccountId, organizationId, AND: accountWhere },
          select: { id: true },
        }),
      ]);
      if (!accessibleCredit || !accessibleAccount) {
        throw new NotFoundError("Record not found.");
      }

      const [lockedCredit] = await tx.$queryRaw<LockedCreditRow[]>`
        SELECT id, "customerId", status, "remainingAmount", source
        FROM "HirePurchaseCredit"
        WHERE id = ${creditId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;
      if (!lockedCredit) throw new NotFoundError("Record not found.");
      if (lockedCredit.status !== "OPEN") {
        throw new CreditNotApplicableError("This credit is no longer open.");
      }

      const [lockedAccount] = await tx.$queryRaw<LockedAccountRow[]>`
        SELECT id, "customerId", balance, "totalPaid", status
        FROM "HirePurchaseAccount"
        WHERE id = ${targetAccountId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;
      if (!lockedAccount) throw new NotFoundError("Record not found.");
      if (lockedAccount.customerId !== lockedCredit.customerId) {
        throw new CreditNotApplicableError("The target account must belong to the same customer as the credit.");
      }

      const targetBalance = new Prisma.Decimal(lockedAccount.balance);
      if (targetBalance.lessThanOrEqualTo(0)) {
        throw new CreditNotApplicableError("That account has no outstanding balance to apply a credit to.");
      }

      const creditRemaining = new Prisma.Decimal(lockedCredit.remainingAmount);
      const applyAmount = Prisma.Decimal.min(creditRemaining, targetBalance);
      const remainingCredit = creditRemaining.minus(applyAmount);
      const nextBalance = targetBalance.minus(applyAmount);
      const nextTotalPaid = new Prisma.Decimal(lockedAccount.totalPaid).plus(applyAmount);
      const nextStatus: HirePurchaseAccountStatus =
        nextBalance.lessThanOrEqualTo(0)
          ? "COMPLETED"
          : lockedAccount.status === "DORMANT" || lockedAccount.status === "PROBATION"
            ? "ACTIVE"
            : lockedAccount.status;

      await tx.hirePurchasePayment.create({
        data: {
          organizationId,
          accountId: targetAccountId,
          receiptNo,
          amount: applyAmount.toFixed(2),
          paymentDate: new Date(),
          method: "Credit applied",
          notes: `Applied from credit ${lockedCredit.id} (${lockedCredit.source})`,
        },
      });

      const accountUpdated = await tx.hirePurchaseAccount.updateMany({
        where: { id: targetAccountId, organizationId, AND: accountWhere },
        data: { totalPaid: nextTotalPaid.toFixed(2), balance: nextBalance.toFixed(2), status: nextStatus },
      });
      if (accountUpdated.count !== 1) throw new NotFoundError("Record not found.");

      const creditUpdated = await tx.hirePurchaseCredit.updateMany({
        where: { id: creditId, organizationId, AND: creditWhere },
        data: { remainingAmount: remainingCredit.toFixed(2), status: remainingCredit.lessThanOrEqualTo(0) ? "APPLIED" : "OPEN" },
      });
      if (creditUpdated.count !== 1) throw new NotFoundError("Record not found.");
    });
  });
}

// --- Lifecycle sweep ---

const DORMANT_AFTER_DAYS = 21;
const PROBATION_AFTER_MONTHS = 4;
const CLOSE_AFTER_MONTHS = 6;

function monthsAgo(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  return result;
}

/** Next occurrence of `payrollDay` (day-of-month) on/after `from` — informational only, no automated payroll run exists. */
function getNextPayrollDate(payrollDay: number, from: Date): Date {
  const candidate = new Date(from.getFullYear(), from.getMonth(), payrollDay);
  if (candidate < from) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return candidate;
}

async function getLastActivityDate(
  organizationId: string,
  scope: InstallmentAccessScope,
  account: { id: string; startDate: Date },
) {
  const ownershipWhere = requireOwnershipWhere(paymentOwnershipWhere(scope));
  const lastPayment = await db.hirePurchasePayment.findFirst({
    where: { organizationId, accountId: account.id, AND: ownershipWhere },
    orderBy: { paymentDate: "desc" },
  });
  return lastPayment?.paymentDate ?? account.startDate;
}

export async function refreshAccountLifecycleStatuses(
  organizationId: string,
  scope: InstallmentAccessScope,
  now: Date = new Date(),
) {
  const accountWhere = requireOwnershipWhere(accountOwnershipWhere(scope));
  const creditWhere = requireOwnershipWhere(creditOwnershipWhere(scope));
  const settings = await getInstallmentSettings(organizationId);

  // COMPLETED + delivered long enough ago -> ARCHIVED
  const toArchive = await db.hirePurchaseAccount.findMany({
    where: {
      organizationId,
      status: "COMPLETED",
      deliveryStatus: "DELIVERED",
      deliveredAt: { lte: addDays(now, -settings.deliveryTimeAfterCompletionDays) },
      AND: accountWhere,
    },
  });
  for (const account of toArchive) {
    await db.hirePurchaseAccount.updateMany({
      where: { id: account.id, organizationId, status: "COMPLETED", AND: accountWhere },
      data: { status: "ARCHIVED" },
    });
  }

  // ACTIVE/DORMANT/PROBATION with a balance -> re-evaluate against last activity
  const candidates = await db.hirePurchaseAccount.findMany({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "DORMANT", "PROBATION"] },
      balance: { gt: 0 },
      AND: accountWhere,
    },
  });

  for (const account of candidates) {
    const lastActivity = await getLastActivityDate(organizationId, scope, account);

    let nextStatus: HirePurchaseAccountStatus = "ACTIVE";
    if (lastActivity <= monthsAgo(now, CLOSE_AFTER_MONTHS)) {
      nextStatus = "CLOSED";
    } else if (lastActivity <= monthsAgo(now, PROBATION_AFTER_MONTHS)) {
      nextStatus = "PROBATION";
    } else if (lastActivity <= addDays(now, -DORMANT_AFTER_DAYS)) {
      nextStatus = "DORMANT";
    }

    if (nextStatus === account.status) continue;

    // Claims the status transition atomically before creating anything —
    // two concurrent sweeps (e.g. two users loading a report at once)
    // previously could both pass the same "no existing refund" check for
    // the same newly-CLOSED account and both create a duplicate refund
    // credit. Now only whichever sweep's updateMany actually flips the
    // status (matches a row) proceeds to create the one refund credit.
    const claimed = await db.hirePurchaseAccount.updateMany({
      where: { id: account.id, organizationId, status: account.status, AND: accountWhere },
      data: { status: nextStatus },
    });
    if (claimed.count === 0) continue;

    if (nextStatus === "CLOSED" && new Prisma.Decimal(account.totalPaid).greaterThan(0)) {
      const existingRefund = await db.hirePurchaseCredit.findFirst({
        where: {
          accountId: account.id,
          organizationId,
          source: "ACCOUNT_CLOSURE_REFUND",
          status: { not: "VOID" },
          AND: creditWhere,
        },
      });
      if (!existingRefund) {
        const feePercent = new Prisma.Decimal(settings.refundDeductionPercent);
        const totalPaid = new Prisma.Decimal(account.totalPaid);
        const serviceFee = totalPaid.times(feePercent).div(100);
        const refundAmount = Prisma.Decimal.max(totalPaid.minus(serviceFee), 0);
        await db.hirePurchaseCredit.create({
          data: {
            organizationId,
            customerId: account.customerId,
            accountId: account.id,
            amount: refundAmount.toFixed(2),
            remainingAmount: refundAmount.toFixed(2),
            status: "OPEN",
            source: "ACCOUNT_CLOSURE_REFUND" as HirePurchaseCreditSource,
            notes: `Account closed after inactivity. Service fee deducted: ${feePercent}%.`,
          },
        });
      }
    }
  }
}

export class ReactivationNotEligibleError extends Error {}

export async function reactivateAccount(
  organizationId: string,
  scope: InstallmentAccessScope,
  id: string,
) {
  const accountWhere = requireOwnershipWhere(accountOwnershipWhere(scope));
  const creditWhere = requireOwnershipWhere(creditOwnershipWhere(scope));
  const account = await db.hirePurchaseAccount.findFirst({
    where: { id, organizationId, AND: accountWhere },
  });
  if (!account) throw new NotFoundError("Record not found.");
  if (!["DORMANT", "PROBATION", "CLOSED"].includes(account.status)) {
    throw new ReactivationNotEligibleError("Only dormant, probation, or closed accounts can be reactivated.");
  }

  const lastActivity = await getLastActivityDate(organizationId, scope, account);
  if (lastActivity > monthsAgo(new Date(), CLOSE_AFTER_MONTHS)) {
    throw new ReactivationNotEligibleError(`This account isn't eligible for reactivation yet (requires ${CLOSE_AFTER_MONTHS}+ months of inactivity).`);
  }

  const settings = await getInstallmentSettings(organizationId);
  const feePercent = new Prisma.Decimal(settings.refundDeductionPercent);
  const totalPaid = new Prisma.Decimal(account.totalPaid);
  const serviceFee = totalPaid.times(feePercent).div(100);
  const nextTotalPaid = Prisma.Decimal.max(totalPaid.minus(serviceFee), 0);
  const nextBalance = Prisma.Decimal.max(new Prisma.Decimal(account.targetAmount).minus(nextTotalPaid), 0);
  const nextStatus: HirePurchaseAccountStatus = nextBalance.lessThanOrEqualTo(0) ? "COMPLETED" : "ACTIVE";

  return db.$transaction(async (tx) => {
    await tx.hirePurchaseCredit.updateMany({
      where: {
        accountId: id,
        organizationId,
        source: "ACCOUNT_CLOSURE_REFUND",
        status: "OPEN",
        AND: creditWhere,
      },
      data: { status: "VOID", remainingAmount: 0 },
    });

    const updated = await tx.hirePurchaseAccount.updateMany({
      where: { id, organizationId, status: account.status, AND: accountWhere },
      data: { totalPaid: nextTotalPaid.toFixed(2), balance: nextBalance.toFixed(2), status: nextStatus },
    });
    if (updated.count !== 1) throw new NotFoundError("Record not found.");

    return tx.hirePurchaseAccount.findFirstOrThrow({
      where: { id, organizationId, AND: accountWhere },
    });
  });
}

// --- Procurement ---

/**
 * Which products should be restocked from suppliers, based on customer
 * payment progress — one of the few GLV settings fields actually read live
 * (`procurementThresholdPercent`, default 70%): an account's product is
 * ready for procurement once the customer has paid at least that
 * percentage of the target amount.
 */
export async function getProcurementList(organizationId: string) {
  const settings = await getInstallmentSettings(organizationId);
  const threshold = Math.min(Math.max(Number(settings.procurementThresholdPercent), 0), 100) / 100;

  const accounts = await db.hirePurchaseAccount.findMany({
    where: { organizationId, deliveryStatus: "PENDING", status: { in: ["ACTIVE", "COMPLETED", "DORMANT", "PROBATION"] } },
    include: { product: true },
  });

  const byProduct = new Map<
    string,
    { productId: string; productName: string; landedUnitCost: number; quantity: number; progressSum: number; highestProgress: number }
  >();

  for (const account of accounts) {
    const progress = Number(account.targetAmount) > 0 ? Number(account.totalPaid) / Number(account.targetAmount) : 0;
    if (progress < threshold) continue;

    const entry = byProduct.get(account.productId) ?? {
      productId: account.productId,
      productName: account.product.name,
      landedUnitCost: Number(account.product.costPrice) + Number(account.product.transportCost),
      quantity: 0,
      progressSum: 0,
      highestProgress: 0,
    };
    entry.quantity += 1;
    entry.progressSum += progress;
    entry.highestProgress = Math.max(entry.highestProgress, progress);
    byProduct.set(account.productId, entry);
  }

  return Array.from(byProduct.values())
    .map((entry) => ({
      ...entry,
      totalCost: entry.landedUnitCost * entry.quantity,
      averageProgress: entry.progressSum / entry.quantity,
    }))
    .sort((a, b) => b.quantity - a.quantity || b.highestProgress - a.highestProgress);
}

// --- Reports ---

export async function getInstallmentSummary(organizationId: string) {
  await refreshAccountLifecycleStatuses(organizationId, { kind: "organization" });

  const accounts = await db.hirePurchaseAccount.findMany({ where: { organizationId }, include: { product: true } });
  const now = new Date();

  const expectedReceivables = accounts
    .filter((a) => ["ACTIVE", "OVERDUE"].includes(getEffectiveAccountStatus(a, now)))
    .reduce((sum, a) => sum + Number(a.balance), 0);

  const includedForCost = accounts.filter((a) => !["CANCELLED", "CLOSED", "ARCHIVED"].includes(a.status));
  const totalProductCost = includedForCost.reduce((sum, a) => sum + Number(a.product.costPrice) + Number(a.product.transportCost), 0);
  const totalExpectedProfit = includedForCost.reduce(
    (sum, a) => sum + (Number(a.targetAmount) - (Number(a.product.costPrice) + Number(a.product.transportCost))),
    0
  );

  const totalCollectedAgg = await db.hirePurchasePayment.aggregate({ where: { organizationId }, _sum: { amount: true } });
  const totalCollected = Number(totalCollectedAgg._sum.amount ?? 0);

  const prevMonthStart = monthStart(monthsAgo(now, 1));
  const currentMonthStart = monthStart(now);
  const prevMonthEnd = addDays(currentMonthStart, -1);

  const salaryPaidAgg = await db.hirePurchaseStaffSalaryPayment.aggregate({
    where: { organizationId, salaryMonth: { gte: prevMonthStart, lte: prevMonthEnd } },
    _sum: { amount: true },
  });
  const totalSalaryPaid = Number(salaryPaidAgg._sum.amount ?? 0);

  const activeStaff = await db.hirePurchaseStaff.findMany({ where: { organizationId, active: true } });
  let currentMonthPayroll = 0;
  let dueMonthPayroll = 0;
  for (const staff of activeStaff) {
    currentMonthPayroll += await getEffectiveMonthlySalary(staff.id, organizationId, currentMonthStart);
    dueMonthPayroll += await getEffectiveMonthlySalary(staff.id, organizationId, prevMonthStart);
  }

  const outstandingSalaries = Math.max(dueMonthPayroll - totalSalaryPaid, 0);
  const netProfitSoFar = totalCollected - totalProductCost - totalSalaryPaid;
  const projectedNetProfit = totalExpectedProfit - currentMonthPayroll;

  const openCredits = await db.hirePurchaseCredit.findMany({ where: { organizationId, status: "OPEN" } });
  const openCreditsTotal = openCredits.reduce((sum, c) => sum + Number(c.remainingAmount), 0);
  const openClosureRefunds = openCredits.filter((c) => c.source === "ACCOUNT_CLOSURE_REFUND").length;

  const settings = await getInstallmentSettings(organizationId);
  const nextPayrollDate = getNextPayrollDate(settings.payrollDay, now);
  const daysUntilPayroll = Math.ceil((nextPayrollDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    expectedReceivables,
    totalCollected,
    totalProductCost,
    totalExpectedProfit,
    totalSalaryPaid,
    currentMonthPayroll,
    dueMonthPayroll,
    outstandingSalaries,
    netProfitSoFar,
    projectedNetProfit,
    nextPayrollDate,
    daysUntilPayroll,
    openCreditsCount: openCredits.length,
    openCreditsTotal,
    openClosureRefunds,
    accountCount: accounts.length,
    customerCount: await db.hirePurchaseCustomer.count({ where: { organizationId } }),
  };
}

export async function getStaffPerformanceReport(organizationId: string) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = addDays(now, mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = addDays(weekStart, 7);

  const settings = await getInstallmentSettings(organizationId);
  const commissionRate = settings.commissionEnabled ? Number(settings.commissionPercentage) / 100 : 0;

  const staffList = await db.hirePurchaseStaff.findMany({ where: { organizationId } });
  const rows = [];

  for (const staff of staffList) {
    const customers = await db.hirePurchaseCustomer.findMany({ where: { organizationId, staffId: staff.id }, select: { id: true } });
    const customerIds = customers.map((c) => c.id);
    const accounts = await db.hirePurchaseAccount.findMany({ where: { organizationId, customerId: { in: customerIds } } });
    const accountIds = accounts.map((a) => a.id);

    const weeklyCollectionAgg = await db.hirePurchasePayment.aggregate({
      where: { organizationId, accountId: { in: accountIds }, paymentDate: { gte: weekStart, lt: weekEnd } },
      _sum: { amount: true },
    });
    const weeklyCollection = Number(weeklyCollectionAgg._sum.amount ?? 0);

    const contractValue = accounts.reduce((sum, a) => sum + Number(a.targetAmount), 0);
    const outstandingBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
    const totalCollected = accounts.reduce((sum, a) => sum + Number(a.totalPaid), 0);

    const salaryPaidAgg = await db.hirePurchaseStaffSalaryPayment.aggregate({
      where: { organizationId, staffId: staff.id, salaryMonth: { gte: monthStart(monthsAgo(now, 1)) } },
      _sum: { amount: true },
    });
    const salaryPaid = Number(salaryPaidAgg._sum.amount ?? 0);
    const monthlySalary = await getEffectiveMonthlySalary(staff.id, organizationId, now);
    const commissionEarned = weeklyCollection * commissionRate;

    rows.push({
      staffId: staff.id,
      staffName: staff.fullName,
      staffCode: staff.code,
      customerCount: customerIds.length,
      accountCount: accounts.length,
      weeklyCollection,
      contractValue,
      outstandingBalance,
      totalCollected,
      salaryPaid,
      monthlySalary,
      salaryBalance: Math.max(monthlySalary - salaryPaid, 0),
      commissionEarned,
      netPosition: totalCollected - salaryPaid - commissionEarned,
    });
  }

  return rows.sort((a, b) => b.weeklyCollection - a.weeklyCollection);
}

export async function getActivityReport(organizationId: string, scope: InstallmentAccessScope) {
  const accountWhere = accountOwnershipWhere(scope);
  const paymentWhere = paymentOwnershipWhere(scope);
  if (!accountWhere || !paymentWhere) return [];

  await refreshAccountLifecycleStatuses(organizationId, scope);

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = addDays(now, mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  const accounts = await db.hirePurchaseAccount.findMany({
    where: { organizationId, ...accountWhere },
  });
  const days = [];

  for (let i = 0; i < 7; i += 1) {
    const dayStart = addDays(weekStart, i);
    const dayEnd = addDays(dayStart, 1);

    const expectedAmount = accounts.reduce((sum, account) => {
      const effectiveStatus = getEffectiveAccountStatus(account, dayEnd);
      const isExpected =
        (effectiveStatus === "ACTIVE" || effectiveStatus === "OVERDUE") &&
        Number(account.balance) > 0 &&
        account.startDate <= dayStart &&
        (effectiveStatus === "OVERDUE" || account.expectedEndDate >= dayStart);
      return isExpected ? sum + Number(account.dailyAmount) : sum;
    }, 0);

    const actualAgg = await db.hirePurchasePayment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: dayStart, lt: dayEnd },
        ...paymentWhere,
      },
      _sum: { amount: true },
    });

    days.push({ date: dayStart, expectedAmount, actualAmount: Number(actualAgg._sum.amount ?? 0) });
  }

  return days;
}
