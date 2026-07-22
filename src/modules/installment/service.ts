import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  HirePurchaseAccountStatus,
  HirePurchaseCreditSource,
} from "@prisma/client";
import { createWithUniqueRetry } from "@/lib/unique-retry";

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

// --- Staff scope (field staff see only their own customers/accounts/payments; managers see all) ---

export interface InstallmentStaffScope {
  isManager: boolean;
  /** null = no filter (manager). A staffId = restrict to that staff's records. */
  staffId: string | null;
}

export async function resolveInstallmentStaffScope(
  organizationId: string,
  userId: string,
  isManager: boolean
): Promise<InstallmentStaffScope> {
  if (isManager) return { isManager: true, staffId: null };
  const staff = await db.hirePurchaseStaff.findFirst({ where: { organizationId, userId } });
  // A non-manager with no linked staff row sees nothing, rather than everything, as a safe default.
  return { isManager: false, staffId: staff?.id ?? "__none__" };
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

// --- Staff ---

export function listStaff(organizationId: string) {
  return db.hirePurchaseStaff.findMany({ where: { organizationId }, orderBy: { fullName: "asc" } });
}

export async function createStaff(
  organizationId: string,
  data: { fullName: string; email?: string | null; phone?: string | null; monthlySalary: string; code?: string | null }
) {
  const settings = await getInstallmentSettings(organizationId);
  const code = data.code || (await generateStaffCode(organizationId, data.fullName, settings.staffCodeLength));

  return db.$transaction(async (tx) => {
    const staff = await tx.hirePurchaseStaff.create({
      data: {
        organizationId,
        code,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        monthlySalary: data.monthlySalary,
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
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export async function updateStaff(
  organizationId: string,
  id: string,
  data: { fullName: string; email?: string | null; phone?: string | null; monthlySalary: string; active: boolean }
) {
  const staff = await db.hirePurchaseStaff.findFirst({ where: { id, organizationId } });
  if (!staff) return null;

  const salaryChanged = staff.monthlySalary.toString() !== data.monthlySalary;

  return db.$transaction(async (tx) => {
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

export function listStaffSalaryPayments(organizationId: string, staffId?: string) {
  return db.hirePurchaseStaffSalaryPayment.findMany({
    where: { organizationId, ...(staffId ? { staffId } : {}) },
    orderBy: { paymentDate: "desc" },
  });
}

export async function getEffectiveMonthlySalary(staffId: string, organizationId: string, asOf: Date): Promise<number> {
  const staff = await db.hirePurchaseStaff.findFirst({ where: { id: staffId, organizationId } });
  if (!staff) return 0;

  const history = await db.hirePurchaseStaffSalaryHistory.findMany({
    where: { staffId, organizationId },
    orderBy: { effectiveMonth: "asc" },
  });

  const asOfMonth = monthStart(asOf);
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

export class InsufficientInventoryError extends Error {}

async function consumeStaffInventory(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  staffId: string,
  productId: string
) {
  const row = await tx.hirePurchaseStaffInventory.findUnique({
    where: { staffId_productId: { staffId, productId } },
  });

  if (!row || row.quantity <= 0) {
    throw new InsufficientInventoryError("This staff member has no stock left for this product.");
  }

  await tx.hirePurchaseStaffInventory.update({ where: { id: row.id }, data: { quantity: row.quantity - 1 } });
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

export function listCustomers(organizationId: string, staffId: string | null) {
  return db.hirePurchaseCustomer.findMany({
    where: { organizationId, ...(staffId ? { staffId } : {}) },
    include: { staff: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCustomer(
  organizationId: string,
  data: { fullName: string; phone?: string | null; address?: string | null; nationalId?: string | null; staffId: string }
) {
  const staff = await db.hirePurchaseStaff.findFirst({ where: { id: data.staffId, organizationId } });
  if (!staff) throw new Error("Assigned staff member not found.");

  const settings = await getInstallmentSettings(organizationId);
  const customerCode = await generateCustomerCode(organizationId, staff.code, settings.customerIdPrefix);

  return db.hirePurchaseCustomer.create({ data: { organizationId, customerCode, ...data } });
}

export async function updateCustomer(
  organizationId: string,
  id: string,
  data: { fullName: string; phone?: string | null; address?: string | null; nationalId?: string | null; staffId: string }
) {
  const staff = await db.hirePurchaseStaff.findFirst({ where: { id: data.staffId, organizationId } });
  if (!staff) throw new NotFoundError("Staff member not found.");
  return db.hirePurchaseCustomer.update({ where: { id, organizationId }, data });
}

// --- Accounts ---

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function listAccounts(organizationId: string, staffId: string | null) {
  return db.hirePurchaseAccount.findMany({
    where: { organizationId, ...(staffId ? { customer: { staffId } } : {}) },
    include: { customer: true, product: true, inventoryStaff: true },
    orderBy: { createdAt: "desc" },
  });
}

export class MinimumDepositError extends Error {}
export class NotFoundError extends Error {}

/**
 * `administrationFeePercent` and `minimumDeposit` are real, enforced rules
 * here — unlike GLV, which stores both but never reads either. The admin
 * fee is added on top of the product price as a one-time origination fee;
 * the minimum deposit (if set) must be met by an optional initial payment
 * collected at account opening.
 */
export async function createAccount(
  organizationId: string,
  data: { customerId: string; productId: string; inventoryStaffId: string; startDate: Date; initialDeposit?: string }
) {
  const product = await db.hirePurchaseProduct.findFirst({ where: { id: data.productId, organizationId } });
  if (!product) throw new NotFoundError("Product not found.");

  const customer = await db.hirePurchaseCustomer.findFirst({ where: { id: data.customerId, organizationId } });
  if (!customer) throw new NotFoundError("Customer not found.");

  const inventoryStaff = await db.hirePurchaseStaff.findFirst({ where: { id: data.inventoryStaffId, organizationId } });
  if (!inventoryStaff) throw new NotFoundError("Staff member not found.");

  const settings = await getInstallmentSettings(organizationId);
  // Prisma.Decimal (arbitrary-precision) rather than JS Number arithmetic —
  // targetAmount/balance are derived values written straight to the
  // database at account opening, so float rounding error here would be a
  // real, persisted discrepancy rather than a transient display artifact.
  const minimumDeposit = new Prisma.Decimal(settings.minimumDeposit);
  const depositAmount = data.initialDeposit ? new Prisma.Decimal(data.initialDeposit) : new Prisma.Decimal(0);

  if (minimumDeposit.greaterThan(0) && depositAmount.lessThan(minimumDeposit)) {
    throw new MinimumDepositError(`A minimum deposit of ${minimumDeposit.toFixed(2)} is required to open this account.`);
  }

  const adminFeeRate = new Prisma.Decimal(settings.administrationFeePercent).div(100);
  const productPrice = new Prisma.Decimal(product.price);
  const adminFee = productPrice.times(adminFeeRate);
  const targetAmount = productPrice.plus(adminFee).toFixed(2);
  const dailyAmount = product.dailyAmount;
  const expectedEndDate = addDays(data.startDate, product.duration);
  const receiptNo = depositAmount.greaterThan(0) ? await generateReceiptNo(organizationId, settings.receiptPrefix) : null;

  return db.$transaction(async (tx) => {
    await consumeStaffInventory(tx, data.inventoryStaffId, data.productId);

    const account = await tx.hirePurchaseAccount.create({
      data: {
        organizationId,
        customerId: data.customerId,
        productId: data.productId,
        inventoryStaffId: data.inventoryStaffId,
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

    if (depositAmount.greaterThan(0) && receiptNo) {
      const nextBalance = Prisma.Decimal.max(new Prisma.Decimal(targetAmount).minus(depositAmount), 0);
      await tx.hirePurchasePayment.create({
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

    return account;
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

export async function updateAccountDeliveryStatus(organizationId: string, id: string, deliveredBy: string) {
  const account = await db.hirePurchaseAccount.findFirst({ where: { id, organizationId } });
  if (!account || account.status !== "COMPLETED" || Number(account.balance) > 0) {
    throw new Error("Only completed, fully-paid accounts can be marked delivered.");
  }
  return db.hirePurchaseAccount.update({
    where: { id, organizationId },
    data: { deliveryStatus: "DELIVERED", deliveredAt: new Date(), deliveredBy },
  });
}

const MANUALLY_SETTABLE_STATUSES: HirePurchaseAccountStatus[] = ["SUSPENDED", "CANCELLED", "ACTIVE"];

/**
 * Cancelling an account restores the reserved unit to the assigned staff's
 * inventory — the customer isn't taking delivery of that unit after all.
 * Suspension is treated as temporary/reversible, so it does not touch stock.
 */
export async function setAccountStatus(organizationId: string, id: string, status: HirePurchaseAccountStatus) {
  if (!MANUALLY_SETTABLE_STATUSES.includes(status)) {
    throw new Error("That status can't be set manually.");
  }

  const account = await db.hirePurchaseAccount.findFirst({ where: { id, organizationId } });
  if (!account) throw new Error("Account not found.");

  return db.$transaction(async (tx) => {
    const updated = await tx.hirePurchaseAccount.update({ where: { id, organizationId }, data: { status } });

    if (status === "CANCELLED" && account.status !== "CANCELLED" && account.inventoryStaffId) {
      await restoreStaffInventory(tx, organizationId, account.inventoryStaffId, account.productId);
    }

    return updated;
  });
}

// --- Payments ---

export function listPayments(organizationId: string, staffId: string | null) {
  return db.hirePurchasePayment.findMany({
    where: { organizationId, ...(staffId ? { account: { customer: { staffId } } } : {}) },
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
  data: { accountId: string; amount: string; paymentDate: Date; method: string; notes?: string | null; receivedBy?: string | null }
) {
  const amount = new Prisma.Decimal(data.amount);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new InvalidPaymentAmountError("Payment amount must be a positive number.");
  }

  const account = await db.hirePurchaseAccount.findFirst({ where: { id: data.accountId, organizationId } });
  if (!account) throw new NotFoundError("Account not found.");
  if (BLOCKED_PAYMENT_STATUSES.includes(account.status) || new Prisma.Decimal(account.balance).lessThanOrEqualTo(0)) {
    throw new PaymentBlockedError("This account can't accept new payments in its current state.");
  }

  const settings = await getInstallmentSettings(organizationId);

  // The whole transaction attempt is retried on a receipt-number collision
  // (not just the create call), regenerating receiptNo fresh each time.
  return createWithUniqueRetry(async () => {
  const receiptNo = await generateReceiptNo(organizationId, settings.receiptPrefix);

  return db.$transaction(async (tx) => {
    const payment = await tx.hirePurchasePayment.create({
      data: { organizationId, receiptNo, ...data },
    });

    const updated = await tx.hirePurchaseAccount.update({
      where: { id: account.id },
      data: { totalPaid: { increment: amount.toNumber() }, balance: { decrement: amount.toNumber() } },
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
      await tx.hirePurchaseAccount.update({
        where: { id: account.id },
        data: { balance: clampedBalance.toFixed(2), status: nextStatus },
      });
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
  id: string,
  data: { amount: string; paymentDate: Date; method: string; notes?: string | null }
) {
  const payment = await db.hirePurchasePayment.findFirst({
    where: { id, organizationId },
    include: { credit: true },
  });
  if (!payment) throw new Error("Payment not found.");

  const settings = await getInstallmentSettings(organizationId);
  if (!canEditPayment(payment, settings.paymentEditWindowHours)) {
    throw new PaymentEditWindowError(`This payment can only be edited within ${settings.paymentEditWindowHours} hour(s) of recording.`);
  }

  const amountChanged = payment.amount.toString() !== data.amount;
  if (amountChanged && payment.credit && (payment.credit.status !== "OPEN" || payment.credit.remainingAmount.toString() !== payment.credit.amount.toString())) {
    throw new PaymentCreditLockedError("This payment has a resolved or partially used credit and cannot have its amount edited.");
  }

  return db.$transaction(async (tx) => {
    await tx.hirePurchasePayment.update({ where: { id }, data });
    await recalculateAccountAfterPaymentChange(tx, organizationId, payment.accountId);
  });
}

async function recalculateAccountAfterPaymentChange(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  organizationId: string,
  accountId: string
) {
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

  const account = await tx.hirePurchaseAccount.findFirstOrThrow({ where: { id: accountId, organizationId } });
  const payments = await tx.hirePurchasePayment.findMany({ where: { accountId } });

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

  await tx.hirePurchaseAccount.update({
    where: { id: accountId },
    data: { totalPaid: totalPaid.toFixed(2), balance: balance.toFixed(2), status: nextStatus },
  });

  const existingCredit = await tx.hirePurchaseCredit.findFirst({
    where: { accountId, source: "PAYMENT_OVERPAYMENT", status: "OPEN" },
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

export function listCredits(organizationId: string, staffId: string | null) {
  return db.hirePurchaseCredit.findMany({
    where: { organizationId, ...(staffId ? { customer: { staffId } } : {}) },
    include: { customer: true, account: true },
    orderBy: { createdAt: "desc" },
  });
}

export function markCreditRefunded(organizationId: string, id: string, resolvedBy: string) {
  return db.hirePurchaseCredit.updateMany({
    where: { id, organizationId, status: "OPEN" },
    data: { status: "REFUNDED", remainingAmount: 0, resolvedBy, resolvedAt: new Date() },
  });
}

export function voidCredit(organizationId: string, id: string, resolvedBy: string) {
  return db.hirePurchaseCredit.updateMany({
    where: { id, organizationId, status: "OPEN" },
    data: { status: "VOID", remainingAmount: 0, resolvedBy, resolvedAt: new Date() },
  });
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
export async function applyCreditToAccount(organizationId: string, creditId: string, targetAccountId: string) {
  const settings = await getInstallmentSettings(organizationId);
  const receiptNo = await generateReceiptNo(organizationId, settings.receiptPrefix);

  return db.$transaction(async (tx) => {
    const [lockedCredit] = await tx.$queryRaw<LockedCreditRow[]>`
      SELECT id, "customerId", status, "remainingAmount", source
      FROM "HirePurchaseCredit"
      WHERE id = ${creditId} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (!lockedCredit || lockedCredit.status !== "OPEN") {
      throw new CreditNotApplicableError("This credit is no longer open.");
    }

    const [lockedAccount] = await tx.$queryRaw<LockedAccountRow[]>`
      SELECT id, "customerId", balance, "totalPaid", status
      FROM "HirePurchaseAccount"
      WHERE id = ${targetAccountId} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (!lockedAccount || lockedAccount.customerId !== lockedCredit.customerId) {
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

    await tx.hirePurchaseAccount.update({
      where: { id: targetAccountId },
      data: { totalPaid: nextTotalPaid.toFixed(2), balance: nextBalance.toFixed(2), status: nextStatus },
    });

    await tx.hirePurchaseCredit.update({
      where: { id: creditId },
      data: { remainingAmount: remainingCredit.toFixed(2), status: remainingCredit.lessThanOrEqualTo(0) ? "APPLIED" : "OPEN" },
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

async function getLastActivityDate(organizationId: string, account: { id: string; startDate: Date }) {
  const lastPayment = await db.hirePurchasePayment.findFirst({
    where: { organizationId, accountId: account.id },
    orderBy: { paymentDate: "desc" },
  });
  return lastPayment?.paymentDate ?? account.startDate;
}

export async function refreshAccountLifecycleStatuses(organizationId: string, now: Date = new Date()) {
  const settings = await getInstallmentSettings(organizationId);

  // COMPLETED + delivered long enough ago -> ARCHIVED
  const toArchive = await db.hirePurchaseAccount.findMany({
    where: {
      organizationId,
      status: "COMPLETED",
      deliveryStatus: "DELIVERED",
      deliveredAt: { lte: addDays(now, -settings.deliveryTimeAfterCompletionDays) },
    },
  });
  for (const account of toArchive) {
    await db.hirePurchaseAccount.update({ where: { id: account.id }, data: { status: "ARCHIVED" } });
  }

  // ACTIVE/DORMANT/PROBATION with a balance -> re-evaluate against last activity
  const candidates = await db.hirePurchaseAccount.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "DORMANT", "PROBATION"] }, balance: { gt: 0 } },
  });

  for (const account of candidates) {
    const lastActivity = await getLastActivityDate(organizationId, account);

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
      where: { id: account.id, status: account.status },
      data: { status: nextStatus },
    });
    if (claimed.count === 0) continue;

    if (nextStatus === "CLOSED" && new Prisma.Decimal(account.totalPaid).greaterThan(0)) {
      const existingRefund = await db.hirePurchaseCredit.findFirst({
        where: { accountId: account.id, source: "ACCOUNT_CLOSURE_REFUND", status: { not: "VOID" } },
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

export async function reactivateAccount(organizationId: string, id: string) {
  const account = await db.hirePurchaseAccount.findFirst({ where: { id, organizationId } });
  if (!account || !["DORMANT", "PROBATION", "CLOSED"].includes(account.status)) {
    throw new ReactivationNotEligibleError("Only dormant, probation, or closed accounts can be reactivated.");
  }

  const lastActivity = await getLastActivityDate(organizationId, account);
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
      where: { accountId: id, source: "ACCOUNT_CLOSURE_REFUND", status: "OPEN" },
      data: { status: "VOID", remainingAmount: 0 },
    });

    return tx.hirePurchaseAccount.update({
      where: { id },
      data: { totalPaid: nextTotalPaid.toFixed(2), balance: nextBalance.toFixed(2), status: nextStatus },
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
  await refreshAccountLifecycleStatuses(organizationId);

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
  await refreshAccountLifecycleStatuses(organizationId);

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

export async function getActivityReport(organizationId: string) {
  await refreshAccountLifecycleStatuses(organizationId);

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = addDays(now, mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  const accounts = await db.hirePurchaseAccount.findMany({ where: { organizationId } });
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
      where: { organizationId, paymentDate: { gte: dayStart, lt: dayEnd } },
      _sum: { amount: true },
    });

    days.push({ date: dayStart, expectedAmount, actualAmount: Number(actualAgg._sum.amount ?? 0) });
  }

  return days;
}
