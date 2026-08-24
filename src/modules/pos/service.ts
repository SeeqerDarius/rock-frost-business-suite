import "server-only";

import { db } from "@/lib/db";
import { recordMovement, getStockGrid, InsufficientStockError, NotFoundError } from "@/modules/inventory/service";
import { Prisma, type PosPaymentMethod, type PosSaleStatus } from "@prisma/client";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import {
  getOrganizationModuleConfiguration,
  updateOrganizationModuleConfigurationValues,
} from "@/platform/module-requests/configuration";

const DEFAULT_SALE_NUMBER_PREFIX = "SALE";
const PREFIX_PATTERN = /^[A-Z0-9]{2,8}$/;

/** The receipt footer lives on the dedicated `PosSettings` table (see below);
 * the sale numbering prefix has no column there, so it lives in the generic
 * `OrganizationModule.configuration` store instead. */
export async function getSaleNumberPrefix(organizationId: string) {
  const configuration = await getOrganizationModuleConfiguration(organizationId, "pos");
  const configured = configuration.workflow.saleNumberPrefix;
  return configured && PREFIX_PATTERN.test(configured) ? configured : DEFAULT_SALE_NUMBER_PREFIX;
}

export async function updateSaleNumberPrefix(organizationId: string, saleNumberPrefix: string, actorId?: string | null) {
  await updateOrganizationModuleConfigurationValues(organizationId, "pos", { workflow: { saleNumberPrefix } }, actorId);
}

async function validateWarehouseRef(organizationId: string, warehouseId?: string | null) {
  if (!warehouseId) return;
  const warehouse = await db.inventoryWarehouse.findFirst({ where: { id: warehouseId, organizationId } });
  if (!warehouse) throw new NotFoundError("Warehouse not found.");
}

export { InsufficientStockError, NotFoundError };

/**
 * Fresh module (no reference implementation to migrate from). Every function
 * takes organizationId explicitly and filters on it, per docs/MODULE_BOUNDARIES.md.
 *
 * Deliberate cross-module integration (documented in docs/DECISIONS.md):
 * a sale against a register with a linked InventoryItem and a warehouse
 * calls Inventory's own recordMovement() to post a real stock ISSUE, and a
 * refund reverses it with a RECEIPT — the same "call the other module's
 * public service function, never its Prisma models" discipline established
 * by Procurement's receiving flow.
 */

// --- Registers ---

export function listRegisters(organizationId: string) {
  return db.posRegister.findMany({
    where: { organizationId },
    include: { warehouse: true, sessions: { where: { status: "OPEN" } } },
    orderBy: { name: "asc" },
  });
}

interface RegisterInput {
  name: string;
  warehouseId?: string | null;
  active?: boolean;
}

export async function createRegister(organizationId: string, data: RegisterInput) {
  await validateWarehouseRef(organizationId, data.warehouseId);
  return db.posRegister.create({ data: { organizationId, ...data } });
}

export async function updateRegister(organizationId: string, id: string, data: RegisterInput) {
  await validateWarehouseRef(organizationId, data.warehouseId);
  return db.posRegister.update({ where: { id, organizationId }, data });
}

// --- Sessions ---

export class SessionStateError extends Error {}
export class VarianceApprovalRequiredError extends Error {}

export async function openSession(
  organizationId: string,
  data: { registerId: string; openingFloat: string; openedById?: string | null },
) {
  const register = await db.posRegister.findFirst({ where: { id: data.registerId, organizationId } });
  if (!register) throw new NotFoundError("Register not found.");

  const existingOpen = await db.posSession.findFirst({ where: { registerId: data.registerId, status: "OPEN" } });
  if (existingOpen) throw new SessionStateError("This register already has an open session.");
  return db.posSession.create({ data: { organizationId, ...data } });
}

export async function closeSession(
  organizationId: string,
  sessionId: string,
  data: { closingCash: string; varianceReason?: string | null; allowVariance?: boolean; closedById?: string | null },
) {
  const session = await db.posSession.findFirst({ where: { id: sessionId, organizationId } });
  if (!session) throw new Error("Session not found.");
  if (session.status !== "OPEN") throw new SessionStateError("Only open sessions can be closed.");
  const [cashPayments, cashRefunds] = await Promise.all([
    db.posPayment.aggregate({ where: { organizationId, sale: { sessionId }, method: "CASH" }, _sum: { amount: true } }),
    db.posReturn.aggregate({ where: { organizationId, sale: { sessionId }, status: "COMPLETED", refundMethod: "CASH" }, _sum: { refundAmount: true } }),
  ]);
  const expectedCash = new Prisma.Decimal(session.openingFloat)
    .plus(cashPayments._sum.amount ?? 0)
    .minus(cashRefunds._sum.refundAmount ?? 0);
  const closingCash = new Prisma.Decimal(data.closingCash);
  const cashVariance = closingCash.minus(expectedCash);
  return db.$transaction(async (tx) => {
    const claimed = await tx.posSession.updateMany({
      where: { id: sessionId, organizationId, status: "OPEN" },
      data: {
        status: "CLOSED",
        closingCash,
        expectedCash,
        cashVariance,
        varianceReason: cashVariance.isZero() ? null : data.varianceReason?.trim() || null,
        closedById: data.closedById,
        closedAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new SessionStateError("This session was already closed.");
    if (!cashVariance.isZero() && !data.varianceReason?.trim()) {
      throw new InvalidSaleInputError("A reason is required when counted cash differs from expected cash.");
    }
    if (!cashVariance.isZero() && !data.allowVariance) {
      throw new VarianceApprovalRequiredError("Closing a session with a cash variance requires approval permission.");
    }
    return tx.posSession.findUniqueOrThrow({ where: { id: sessionId } });
  });
}

export function listSessions(organizationId: string) {
  return db.posSession.findMany({
    where: { organizationId },
    include: { register: true, openedBy: true, closedBy: true, sales: true },
    orderBy: { openedAt: "desc" },
  });
}

// --- Sales ---

async function generateSaleNumber(organizationId: string) {
  const [prefix, count] = await Promise.all([
    getSaleNumberPrefix(organizationId),
    db.posSale.count({ where: { organizationId } }),
  ]);
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

export function listSales(organizationId: string) {
  return db.posSale.findMany({
    where: { organizationId },
    include: {
      register: true,
      soldBy: true,
      payments: true,
      returns: { include: { lines: true } },
      lines: { include: { item: true, returnLines: { where: { return: { status: "COMPLETED" } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export function listPayments(organizationId: string) {
  return db.posPayment.findMany({
    where: { organizationId },
    include: { sale: { include: { register: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

interface SaleLineInput {
  itemId?: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
}

interface PaymentInput {
  method: PosPaymentMethod;
  amount: string;
  reference?: string | null;
}

interface SaleInput {
  sessionId: string;
  customerName?: string | null;
  paymentMethod: PosPaymentMethod;
  soldById?: string | null;
  lines: SaleLineInput[];
  payments?: PaymentInput[];
  status?: Extract<PosSaleStatus, "COMPLETED" | "SUSPENDED">;
}

export class SaleStateError extends Error {}
export class InvalidSaleInputError extends Error {}

function validateLines(lines: SaleLineInput[]) {
  if (lines.length === 0 || lines.length > 100) throw new InvalidSaleInputError("A sale must contain between 1 and 100 lines.");
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new InvalidSaleInputError(`"${line.description}" must have a positive whole-number quantity.`);
    }
    const price = Number(line.unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      throw new InvalidSaleInputError(`"${line.description}" has an invalid unit price.`);
    }
  }
}

/**
 * A sale and every line's stock deduction commit as one all-or-nothing
 * transaction: if any line's stock movement fails (insufficient stock,
 * concurrent depletion), the whole sale — including lines that would have
 * succeeded — rolls back rather than leaving a "completed" sale with only
 * some of its stock actually deducted.
 */
export async function createSale(organizationId: string, data: SaleInput) {
  validateLines(data.lines);

  const session = await db.posSession.findFirst({ where: { id: data.sessionId, organizationId } });
  if (!session) throw new NotFoundError("Session not found.");
  if (session.status !== "OPEN") {
    throw new SaleStateError("Sales can only be recorded against a currently open session.");
  }

  const register = await db.posRegister.findFirst({ where: { id: session.registerId, organizationId } });
  if (!register) throw new NotFoundError("Register not found.");

  if (register.warehouseId) {
    // Fast, friendly pre-check outside the transaction — not the safety
    // mechanism itself. The actual guarantee against overselling is the
    // atomic guarded decrement inside Inventory's recordMovement(), run
    // below inside the same transaction as the sale row.
    const stockGrid = await getStockGrid(organizationId);
    for (const line of data.lines) {
      if (!line.itemId) continue;
      const stockRow = stockGrid.find((s) => s.itemId === line.itemId && s.warehouseId === register.warehouseId);
      const available = stockRow?.quantity ?? 0;
      if (available < line.quantity) {
        throw new InsufficientStockError(`Not enough stock of "${line.description}" at this register's warehouse.`);
      }
    }
  }

  const itemIds = [...new Set(data.lines.flatMap((line) => (line.itemId ? [line.itemId] : [])))];
  const items = itemIds.length
    ? await db.inventoryItem.findMany({ where: { organizationId, id: { in: itemIds }, active: true } })
    : [];
  if (items.length !== itemIds.length) throw new NotFoundError("One or more inventory items were not found.");
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const lineTotals = data.lines.map((line) => {
    const item = line.itemId ? itemMap.get(line.itemId) : null;
    const unitPrice = new Prisma.Decimal(line.unitPrice);
    return {
      itemId: line.itemId,
      description: item?.name ?? line.description,
      skuSnapshot: item?.sku ?? null,
      barcodeSnapshot: item?.barcode ?? null,
      quantity: line.quantity,
      unitPrice,
      lineTotal: unitPrice.mul(line.quantity),
    };
  });
  const subtotal = lineTotals.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
  const saleStatus = data.status ?? "COMPLETED";
  const payments = saleStatus === "COMPLETED" ? data.payments ?? [{ method: data.paymentMethod, amount: subtotal.toFixed(2) }] : [];
  if (payments.length > 10) throw new InvalidSaleInputError("A sale supports up to 10 payment parts.");
  const paymentTotal = payments.reduce((sum, payment) => {
    const amount = new Prisma.Decimal(payment.amount);
    if (!amount.isPositive()) throw new InvalidSaleInputError("Every payment amount must be greater than zero.");
    return sum.plus(amount);
  }, new Prisma.Decimal(0));
  if (saleStatus === "COMPLETED" && !paymentTotal.equals(subtotal)) {
    throw new InvalidSaleInputError("Split payments must add up exactly to the sale total.");
  }

  // The whole transaction attempt is retried (not just the create call),
  // regenerating saleNumber fresh each time — a collision can only be
  // detected once tx.posSale.create() runs, partway through the attempt.
  return createWithUniqueRetry(async () => {
    const saleNumber = await generateSaleNumber(organizationId);
    return db.$transaction(async (tx) => {
      const sale = await tx.posSale.create({
        data: {
          organizationId,
          registerId: session.registerId,
          sessionId: data.sessionId,
          saleNumber,
          customerName: data.customerName,
          paymentMethod: data.paymentMethod,
          soldById: data.soldById,
          subtotal,
          total: subtotal,
          status: saleStatus,
          lines: { create: lineTotals },
          payments: { create: payments.map((payment) => ({ organizationId, ...payment })) },
        },
      });

      if (saleStatus === "COMPLETED" && register.warehouseId) {
        for (const line of data.lines) {
          if (!line.itemId) continue;
          await recordMovement(
            organizationId,
            {
              itemId: line.itemId,
              warehouseId: register.warehouseId,
              type: "ISSUE",
              quantity: line.quantity,
              reference: saleNumber,
              notes: `Sold via POS sale ${saleNumber}`,
              createdById: data.soldById,
            },
            tx,
          );
        }
      }

      return sale;
    });
  });
}

export async function resumeSuspendedSale(
  organizationId: string,
  saleId: string,
  payments: PaymentInput[],
  completedById?: string | null,
) {
  const sale = await db.posSale.findFirst({ where: { id: saleId, organizationId }, include: { lines: true, register: true } });
  if (!sale) throw new NotFoundError("Sale not found.");
  const total = new Prisma.Decimal(sale.total);
  const paymentTotal = payments.reduce((sum, payment) => sum.plus(new Prisma.Decimal(payment.amount)), new Prisma.Decimal(0));
  if (payments.length === 0 || payments.length > 10 || !paymentTotal.equals(total)) {
    throw new InvalidSaleInputError("Payments must add up exactly to the suspended sale total.");
  }
  return db.$transaction(async (tx) => {
    const claimed = await tx.posSale.updateMany({
      where: { id: saleId, organizationId, status: "SUSPENDED", session: { status: "OPEN" } },
      data: { status: "COMPLETED", soldById: completedById ?? sale.soldById },
    });
    if (claimed.count !== 1) throw new SaleStateError("Only a suspended sale on an open session can be resumed.");
    await tx.posPayment.createMany({ data: payments.map((payment) => ({ organizationId, saleId, ...payment })) });
    if (sale.register.warehouseId) {
      for (const line of sale.lines) {
        if (!line.itemId) continue;
        await recordMovement(organizationId, { itemId: line.itemId, warehouseId: sale.register.warehouseId, type: "ISSUE", quantity: line.quantity, reference: sale.saleNumber, notes: `Resumed POS sale ${sale.saleNumber}`, createdById: completedById }, tx);
      }
    }
    return tx.posSale.findUniqueOrThrow({ where: { id: saleId } });
  });
}

interface ReturnLineInput { saleLineId: string; quantity: number }

export async function returnSaleLines(
  organizationId: string,
  saleId: string,
  data: { lines: ReturnLineInput[]; reason: string; refundMethod: PosPaymentMethod; processedById?: string | null },
) {
  if (!data.reason.trim()) throw new InvalidSaleInputError("A return reason is required.");
  if (data.lines.length === 0 || data.lines.length > 100) throw new InvalidSaleInputError("Select at least one return line.");
  return createWithUniqueRetry(async () => db.$transaction(async (tx) => {
    const sale = await tx.posSale.findFirst({ where: { id: saleId, organizationId }, include: { lines: true, register: true } });
    if (!sale) throw new NotFoundError("Sale not found.");
    if (!['COMPLETED', 'PARTIALLY_REFUNDED'].includes(sale.status)) throw new SaleStateError("This sale cannot accept a return.");
    await tx.$queryRaw`SELECT "id" FROM "PosSaleLine" WHERE "saleId" = ${saleId} FOR UPDATE`;
    const prior = await tx.posReturnLine.groupBy({ by: ["saleLineId"], where: { return: { saleId, status: "COMPLETED" } }, _sum: { quantity: true } });
    const returned = new Map(prior.map((row) => [row.saleLineId, row._sum.quantity ?? 0]));
    const saleLines = new Map(sale.lines.map((line) => [line.id, line]));
    const returnLines = data.lines.map((input) => {
      const line = saleLines.get(input.saleLineId);
      if (!line || !Number.isInteger(input.quantity) || input.quantity <= 0 || input.quantity + (returned.get(input.saleLineId) ?? 0) > line.quantity) {
        throw new InvalidSaleInputError("A return quantity exceeds the remaining sold quantity.");
      }
      const unitAmount = new Prisma.Decimal(line.lineTotal).div(line.quantity);
      return { saleLineId: line.id, quantity: input.quantity, unitAmount, lineAmount: unitAmount.mul(input.quantity), itemId: line.itemId };
    });
    const refundAmount = returnLines.reduce((sum, line) => sum.plus(line.lineAmount), new Prisma.Decimal(0));
    const count = await tx.posReturn.count({ where: { organizationId } });
    const returnNumber = `RETURN-${String(count + 1).padStart(5, "0")}`;
    const posReturn = await tx.posReturn.create({ data: { organizationId, saleId, returnNumber, reason: data.reason.trim(), refundMethod: data.refundMethod, refundAmount, processedById: data.processedById, lines: { create: returnLines.map((line) => ({ saleLineId: line.saleLineId, quantity: line.quantity, unitAmount: line.unitAmount, lineAmount: line.lineAmount })) } } });
    if (sale.register.warehouseId) {
      for (const line of returnLines) if (line.itemId) await recordMovement(organizationId, { itemId: line.itemId, warehouseId: sale.register.warehouseId, type: "RECEIPT", quantity: line.quantity, reference: returnNumber, notes: `POS return for ${sale.saleNumber}`, createdById: data.processedById }, tx);
    }
    const totalReturned = await tx.posReturnLine.aggregate({ where: { return: { saleId, status: "COMPLETED" } }, _sum: { lineAmount: true } });
    await tx.posSale.update({ where: { id: saleId }, data: { status: new Prisma.Decimal(totalReturned._sum.lineAmount ?? 0).gte(sale.total) ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    return posReturn;
  }));
}

/**
 * Atomically "claims" the sale for refund (COMPLETED -> REFUNDED in a
 * single guarded UPDATE) before posting any stock movement. Two concurrent
 * refund requests for the same sale can therefore never both pass — the
 * second's updateMany matches zero rows because the first already flipped
 * the status, so it throws SaleStateError instead of double-returning stock.
 */
/**
 * Not called from any route today (test-only) — this is a full-sale
 * refund, distinct from returnSaleLines()'s partial-line return. If this is
 * ever wired to a UI action, the caller MUST call reverseModuleRevenue()
 * immediately after, keyed on { sourceType: "POS_SALE", sourceId: sale.id,
 * postingPurpose: "COLLECTED" } — the same identity sell/actions.ts and
 * resumeSale() post under — so the original sale's journal entry is
 * reversed rather than left standing for a sale that no longer exists.
 * Unlike returnSaleLines() (which posts its own distinct refund event
 * because only part of the sale is undone), a full refund undoes the whole
 * sale, so reversing the original entry is the correct shape here, not a
 * second offsetting post.
 */
export async function refundSale(organizationId: string, saleId: string, refundedById?: string | null) {
  const sale = await db.posSale.findFirst({
    where: { id: saleId, organizationId },
    include: { lines: true, register: true },
  });
  if (!sale) throw new NotFoundError("Sale not found.");

  return db.$transaction(async (tx) => {
    const claimed = await tx.posSale.updateMany({
      where: { id: saleId, status: "COMPLETED" },
      data: { status: "REFUNDED" },
    });
    if (claimed.count === 0) {
      throw new SaleStateError("Only completed sales can be refunded.");
    }

    if (sale.register.warehouseId) {
      for (const line of sale.lines) {
        if (!line.itemId) continue;
        await recordMovement(
          organizationId,
          {
            itemId: line.itemId,
            warehouseId: sale.register.warehouseId,
            type: "RECEIPT",
            quantity: line.quantity,
            reference: sale.saleNumber,
            notes: `Refund of POS sale ${sale.saleNumber}`,
            createdById: refundedById,
          },
          tx,
        );
      }
    }

    return tx.posSale.findUniqueOrThrow({ where: { id: saleId } });
  });
}

// --- Settings ---

export async function getSettings(organizationId: string) {
  const existing = await db.posSettings.findUnique({ where: { organizationId } });
  if (existing) return existing;
  return db.posSettings.create({ data: { organizationId } });
}

export function updateSettings(organizationId: string, receiptFooterText: string | null) {
  return db.posSettings.upsert({
    where: { organizationId },
    update: { receiptFooterText },
    create: { organizationId, receiptFooterText },
  });
}

// --- Reports ---

export async function getPosSummary(organizationId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [registerCount, openSessionCount, sales] = await Promise.all([
    db.posRegister.count({ where: { organizationId } }),
    db.posSession.count({ where: { organizationId, status: "OPEN" } }),
    db.posSale.findMany({ where: { organizationId } }),
  ]);

  const completedSales = sales.filter((s) => s.status === "COMPLETED");
  const todaysSales = completedSales.filter((s) => s.createdAt >= todayStart);

  return {
    registerCount,
    openSessionCount,
    todaysSalesCount: todaysSales.length,
    todaysSalesTotal: todaysSales.reduce((sum, s) => sum + Number(s.total), 0),
    allTimeSalesCount: completedSales.length,
    allTimeSalesTotal: completedSales.reduce((sum, s) => sum + Number(s.total), 0),
    refundedCount: sales.filter((s) => s.status === "REFUNDED").length,
  };
}
