import "server-only";

import { db } from "@/lib/db";
import { refreshAccountLifecycleStatuses } from "./lifecycle";
import { getProcurementThresholdRate } from "./settings";
import type {
  AccountRecord,
  CreditRecord,
  CustomerRecord,
  HirePurchaseMetric,
  PaymentRecord,
  ProcurementItem,
  ProductCategoryRecord,
  ProductRecord,
  ReportSummary,
  StaffRecord,
} from "./types";

type Moneyish = number | { toNumber(): number } | null | undefined;

function num(value: Moneyish): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function formatMoney(value: Moneyish): string {
  const n = num(value);
  if (Math.abs(n) >= 1_000_000) return `GHS ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `GHS ${(n / 1_000).toFixed(1)}k`;
  return `GHS ${n.toLocaleString("en-US")}`;
}

function formatDate(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "—";
}

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  DORMANT: "Dormant",
  PROBATION: "Probation",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

const DELIVERY_STATUS_LABEL: Record<string, string> = { PENDING: "Pending", DELIVERED: "Delivered" };
const CREDIT_STATUS_LABEL: Record<string, string> = { OPEN: "Open", REFUNDED: "Refunded", APPLIED: "Applied", VOID: "Void" };
const CREDIT_SOURCE_LABEL: Record<string, string> = {
  PAYMENT_OVERPAYMENT: "Overpayment",
  ACCOUNT_CLOSURE_REFUND: "Closure refund",
  MANUAL_ADJUSTMENT: "Manual adjustment",
};

export async function getDashboardMetrics(organizationId: string): Promise<HirePurchaseMetric[]> {
  await refreshAccountLifecycleStatuses(organizationId);

  const in7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [customerCount, activeAccounts, staffCount, weeklyAgg, monthlyAgg, outstandingAgg, procurementReady, openCredits] =
    await Promise.all([
      db.hirePurchaseCustomer.count({ where: { organizationId } }),
      db.hirePurchaseAccount.count({ where: { organizationId, status: { in: ["ACTIVE", "OVERDUE"] } } }),
      db.hirePurchaseStaff.count({ where: { organizationId, active: true } }),
      db.hirePurchasePayment.aggregate({ where: { organizationId, paymentDate: { gte: in7Days } }, _sum: { amount: true } }),
      db.hirePurchasePayment.aggregate({ where: { organizationId, paymentDate: { gte: in30Days } }, _sum: { amount: true } }),
      db.hirePurchaseAccount.aggregate({
        where: { organizationId, status: { notIn: ["CLOSED", "ARCHIVED", "CANCELLED"] } },
        _sum: { balance: true },
      }),
      getProcurementList(organizationId),
      db.hirePurchaseCredit.count({ where: { organizationId, status: "OPEN" } }),
    ]);

  return [
    { label: "Customers", value: String(customerCount), note: "Registered across all staff.", icon: "👥" },
    { label: "Active accounts", value: String(activeAccounts), note: "Currently collecting installments.", icon: "📄" },
    { label: "Active staff", value: String(staffCount), note: "Field sales roster.", icon: "🧑‍💼" },
    { label: "Weekly collections", value: formatMoney(weeklyAgg._sum.amount), note: "Payments in the last 7 days.", icon: "💵" },
    { label: "Monthly collections", value: formatMoney(monthlyAgg._sum.amount), note: "Payments in the last 30 days.", icon: "📈" },
    { label: "Outstanding balances", value: formatMoney(outstandingAgg._sum.balance), note: "Across open accounts.", icon: "⚖️" },
    { label: "Ready for procurement", value: `${procurementReady.length} product(s)`, note: "Accounts past the payment threshold.", icon: "📦" },
    { label: "Open credits", value: String(openCredits), note: "Unresolved overpayments/refunds.", icon: "💳" },
  ];
}

export async function getStaff(organizationId: string): Promise<StaffRecord[]> {
  const staff = await db.hirePurchaseStaff.findMany({
    where: { organizationId },
    include: { _count: { select: { customers: true } }, user: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });

  return staff.map((s) => ({
    id: s.id,
    code: s.code,
    fullName: s.fullName,
    email: s.email ?? "—",
    phone: s.phone ?? "—",
    active: s.active,
    monthlySalary: formatMoney(s.monthlySalary),
    customerCount: s._count.customers,
    linkedUser: Boolean(s.user),
  }));
}

export async function getCustomers(organizationId: string): Promise<CustomerRecord[]> {
  const customers = await db.hirePurchaseCustomer.findMany({
    where: { organizationId },
    include: { staff: { select: { fullName: true } }, _count: { select: { accounts: true } } },
    orderBy: { createdAt: "desc" },
  });

  return customers.map((c) => ({
    id: c.id,
    customerCode: c.customerCode,
    fullName: c.fullName,
    phone: c.phone ?? "—",
    address: c.address ?? "—",
    nationalId: c.nationalId ?? "—",
    staffName: c.staff.fullName,
    staffId: c.staffId,
    accountCount: c._count.accounts,
    createdAt: formatDate(c.createdAt),
  }));
}

export async function getProductCategories(organizationId: string): Promise<ProductCategoryRecord[]> {
  const categories = await db.hirePurchaseProductCategory.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
  });
  const counts = await db.hirePurchaseProduct.groupBy({ by: ["category"], where: { organizationId }, _count: { _all: true } });
  const countByName = new Map(counts.map((c) => [c.category, c._count._all]));

  return categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    active: cat.active,
    sortOrder: cat.sortOrder,
    productCount: countByName.get(cat.name) ?? 0,
  }));
}

export async function getProducts(organizationId: string): Promise<ProductRecord[]> {
  const products = await db.hirePurchaseProduct.findMany({
    where: { organizationId },
    include: { _count: { select: { accounts: true } } },
    orderBy: { createdAt: "asc" },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description ?? "—",
    costPrice: formatMoney(p.costPrice),
    transportCost: formatMoney(p.transportCost),
    landedCost: formatMoney(num(p.costPrice) + num(p.transportCost)),
    dailyAmount: formatMoney(p.dailyAmount),
    duration: p.duration,
    price: formatMoney(p.price),
    quantityOnSale: p.quantityOnSale,
    active: p.active,
    accountCount: p._count.accounts,
  }));
}

export async function getAccounts(organizationId: string): Promise<AccountRecord[]> {
  await refreshAccountLifecycleStatuses(organizationId);

  const accounts = await db.hirePurchaseAccount.findMany({
    where: { organizationId },
    include: { customer: true, product: true, inventoryStaff: true },
    orderBy: { createdAt: "desc" },
  });

  return accounts.map((a) => ({
    id: a.id,
    customerId: a.customerId,
    customerName: a.customer.fullName,
    customerCode: a.customer.customerCode,
    productId: a.productId,
    productName: a.product.name,
    staffName: a.inventoryStaff?.fullName ?? "—",
    startDate: formatDate(a.startDate),
    expectedEndDate: formatDate(a.expectedEndDate),
    targetAmount: formatMoney(a.targetAmount),
    dailyAmount: formatMoney(a.dailyAmount),
    totalPaid: formatMoney(a.totalPaid),
    balance: formatMoney(a.balance),
    progressPercent: num(a.targetAmount) > 0 ? Math.round((num(a.totalPaid) / num(a.targetAmount)) * 100) : 0,
    status: ACCOUNT_STATUS_LABEL[a.status] ?? a.status,
    deliveryStatus: DELIVERY_STATUS_LABEL[a.deliveryStatus] ?? a.deliveryStatus,
  }));
}

export async function getPayments(organizationId: string): Promise<PaymentRecord[]> {
  const payments = await db.hirePurchasePayment.findMany({
    where: { organizationId },
    include: { account: { include: { customer: true, product: true } } },
    orderBy: { paymentDate: "desc" },
    take: 100,
  });

  return payments.map((p) => ({
    id: p.id,
    receiptNo: p.receiptNo,
    accountId: p.accountId,
    customerName: p.account.customer.fullName,
    productName: p.account.product.name,
    amount: formatMoney(p.amount),
    paymentDate: formatDate(p.paymentDate),
    method: p.method,
    notes: p.notes ?? "—",
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function getCredits(organizationId: string): Promise<CreditRecord[]> {
  const credits = await db.hirePurchaseCredit.findMany({
    where: { organizationId },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  return credits.map((c) => ({
    id: c.id,
    customerName: c.customer.fullName,
    customerId: c.customerId,
    accountId: c.accountId,
    amount: formatMoney(c.amount),
    remainingAmount: formatMoney(c.remainingAmount),
    status: CREDIT_STATUS_LABEL[c.status] ?? c.status,
    source: CREDIT_SOURCE_LABEL[c.source] ?? c.source,
    notes: c.notes ?? "—",
    createdAt: formatDate(c.createdAt),
  }));
}

export async function getProcurementList(organizationId: string): Promise<ProcurementItem[]> {
  const threshold = await getProcurementThresholdRate(organizationId);

  const accounts = await db.hirePurchaseAccount.findMany({
    where: {
      organizationId,
      deliveryStatus: "PENDING",
      status: { in: ["ACTIVE", "COMPLETED", "OVERDUE", "DORMANT", "PROBATION"] },
    },
    include: { product: true },
  });

  const byProduct = new Map<string, { product: (typeof accounts)[number]["product"]; progresses: number[] }>();

  for (const account of accounts) {
    const target = num(account.targetAmount);
    const progress = target > 0 ? num(account.totalPaid) / target : 0;
    if (progress < threshold) continue;

    const entry = byProduct.get(account.productId) ?? { product: account.product, progresses: [] };
    entry.progresses.push(progress);
    byProduct.set(account.productId, entry);
  }

  const items: ProcurementItem[] = Array.from(byProduct.entries()).map(([productId, entry]) => {
    const landedUnitCost = num(entry.product.costPrice) + num(entry.product.transportCost);
    return {
      productId,
      productName: entry.product.name,
      category: entry.product.category,
      quantity: entry.progresses.length,
      totalCost: formatMoney(landedUnitCost * entry.progresses.length),
      landedUnitCost: formatMoney(landedUnitCost),
      averageProgress: Math.round((entry.progresses.reduce((a, b) => a + b, 0) / entry.progresses.length) * 100),
      highestProgress: Math.round(Math.max(...entry.progresses) * 100),
    };
  });

  return items.sort((a, b) => b.quantity - a.quantity || b.highestProgress - a.highestProgress);
}

export async function getReportSummary(organizationId: string): Promise<ReportSummary[]> {
  const [totalCollectedAgg, outstandingAgg, productCostAgg, activeStaffCount, monthlyPayrollAgg, accountCounts] = await Promise.all([
    db.hirePurchasePayment.aggregate({ where: { organizationId }, _sum: { amount: true } }),
    db.hirePurchaseAccount.aggregate({
      where: { organizationId, status: { notIn: ["CANCELLED", "CLOSED", "ARCHIVED"] } },
      _sum: { balance: true },
    }),
    db.hirePurchaseAccount.findMany({
      where: { organizationId, status: { notIn: ["CANCELLED", "CLOSED", "ARCHIVED"] } },
      include: { product: { select: { costPrice: true, transportCost: true } } },
    }),
    db.hirePurchaseStaff.count({ where: { organizationId, active: true } }),
    db.hirePurchaseStaff.aggregate({ where: { organizationId, active: true }, _sum: { monthlySalary: true } }),
    db.hirePurchaseAccount.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
  ]);

  const totalProductCost = productCostAgg.reduce((sum, a) => sum + num(a.product.costPrice) + num(a.product.transportCost), 0);
  const totalCollected = num(totalCollectedAgg._sum.amount);
  const monthlyPayroll = num(monthlyPayrollAgg._sum.monthlySalary);
  const netProfitSoFar = totalCollected - totalProductCost - monthlyPayroll;
  const completedCount = accountCounts.find((a) => a.status === "COMPLETED")?._count._all ?? 0;
  const activeCount = accountCounts.find((a) => a.status === "ACTIVE")?._count._all ?? 0;

  return [
    { name: "Total collected", value: formatMoney(totalCollectedAgg._sum.amount), note: "All-time recorded payments." },
    { name: "Outstanding balances", value: formatMoney(outstandingAgg._sum.balance), note: "Across open, non-closed accounts." },
    { name: "Active staff payroll", value: formatMoney(monthlyPayroll), note: `${activeStaffCount} active staff at current salary.` },
    { name: "Net position", value: formatMoney(netProfitSoFar), note: "Collected minus product cost minus payroll." },
    { name: "Active accounts", value: String(activeCount), note: "Currently collecting installments." },
    { name: "Completed accounts", value: String(completedCount), note: "Paid off in full." },
  ];
}
