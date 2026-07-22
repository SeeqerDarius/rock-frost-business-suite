import "server-only";

import { db } from "@/lib/db";
import { recordMovement, getStockGrid, InsufficientStockError, NotFoundError } from "@/modules/inventory/service";
import type { PosPaymentMethod } from "@prisma/client";
import { createWithUniqueRetry } from "@/lib/unique-retry";

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
  data: { closingCash: string; closedById?: string | null },
) {
  const session = await db.posSession.findFirst({ where: { id: sessionId, organizationId } });
  if (!session) throw new Error("Session not found.");
  if (session.status !== "OPEN") throw new SessionStateError("Only open sessions can be closed.");
  return db.posSession.update({
    where: { id: sessionId },
    data: { status: "CLOSED", closingCash: data.closingCash, closedById: data.closedById, closedAt: new Date() },
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
  const count = await db.posSale.count({ where: { organizationId } });
  return `SALE-${String(count + 1).padStart(5, "0")}`;
}

export function listSales(organizationId: string) {
  return db.posSale.findMany({
    where: { organizationId },
    include: { register: true, soldBy: true, lines: { include: { item: true } } },
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

interface SaleInput {
  sessionId: string;
  customerName?: string | null;
  paymentMethod: PosPaymentMethod;
  soldById?: string | null;
  lines: SaleLineInput[];
}

export class SaleStateError extends Error {}
export class InvalidSaleInputError extends Error {}

function validateLines(lines: SaleLineInput[]) {
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

  const lineTotals = data.lines.map((l) => ({ ...l, lineTotal: (Number(l.unitPrice) * l.quantity).toFixed(2) }));
  const subtotal = lineTotals.reduce((sum, l) => sum + Number(l.lineTotal), 0);

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
          subtotal: subtotal.toFixed(2),
          total: subtotal.toFixed(2),
          lines: { create: lineTotals },
        },
      });

      if (register.warehouseId) {
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

/**
 * Atomically "claims" the sale for refund (COMPLETED -> REFUNDED in a
 * single guarded UPDATE) before posting any stock movement. Two concurrent
 * refund requests for the same sale can therefore never both pass — the
 * second's updateMany matches zero rows because the first already flipped
 * the status, so it throws SaleStateError instead of double-returning stock.
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
