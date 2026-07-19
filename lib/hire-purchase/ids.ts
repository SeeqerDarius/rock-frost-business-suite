import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getHirePurchaseSettings } from "./settings";

/** customerCode format: {prefix}/{staffCode}/{YY}/{seq}, sequential per staff per year. */
export async function generateCustomerCode(organizationId: string, staffId: string): Promise<string> {
  const [settings, staff] = await Promise.all([
    getHirePurchaseSettings(organizationId),
    db.hirePurchaseStaff.findUniqueOrThrow({ where: { id: staffId }, select: { code: true } }),
  ]);

  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `${settings.customerIdPrefix}/${staff.code}/${year}/`;

  const existing = await db.hirePurchaseCustomer.findMany({
    where: { organizationId, staffId, customerCode: { startsWith: prefix } },
    select: { customerCode: true },
  });

  const maxNumber = existing.reduce((max, c) => {
    const value = Number(c.customerCode.replace(prefix, ""));
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);

  return `${prefix}${String(maxNumber + 1).padStart(3, "0")}`;
}

/** receiptNo format: {prefix}/{YY}/{seq}, sequential per organization per year. */
export async function generateReceiptNo(organizationId: string, tx: Prisma.TransactionClient = db): Promise<string> {
  const settings = await getHirePurchaseSettings(organizationId);
  const year = new Date().getFullYear().toString().slice(-2);
  const receiptPrefix = settings.receiptPrefix.replace(/\/+$/, "");
  const prefix = `${receiptPrefix}/${year}/`;

  const existing = await tx.hirePurchasePayment.findMany({
    where: { organizationId, receiptNo: { startsWith: prefix } },
    select: { receiptNo: true },
  });

  const maxNumber = existing.reduce((max, p) => {
    const value = Number(p.receiptNo.replace(prefix, ""));
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);

  return `${prefix}${String(maxNumber + 1).padStart(6, "0")}`;
}

const STAFF_CODE_OVERRIDES: Record<string, string> = {};

/** Staff code: first word of the name, letters only, truncated/padded to settings.staffCodeLength, uniqued with a numeric suffix. */
export async function generateStaffCode(organizationId: string, fullName: string, excludeStaffId?: string): Promise<string> {
  const settings = await getHirePurchaseSettings(organizationId);
  const firstWord = fullName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const override = STAFF_CODE_OVERRIDES[firstWord];
  const lettersOnly = firstWord.replace(/[^a-z]/g, "");
  const base = (override ?? lettersOnly.slice(0, settings.staffCodeLength)).toUpperCase();

  if (!base) {
    throw new Error("Staff name must contain letters.");
  }

  const existing = await db.hirePurchaseStaff.findMany({
    where: { organizationId, code: { startsWith: base } },
    select: { id: true, code: true },
  });
  const taken = new Set(existing.filter((s) => s.id !== excludeStaffId).map((s) => s.code));

  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}
