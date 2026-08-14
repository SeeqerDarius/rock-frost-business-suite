import "server-only";

import { db } from "@/lib/db";
import { recordMovement } from "@/modules/inventory/service";
import type { ProcurementRequestStatus, ProcurementOrderStatus } from "@prisma/client";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import {
  getOrganizationModuleConfiguration,
  updateOrganizationModuleConfigurationValues,
} from "@/platform/module-requests/configuration";

export class NotFoundError extends Error {}

const DEFAULT_ORDER_NUMBER_PREFIX = "PO";
const PREFIX_PATTERN = /^[A-Z0-9]{2,8}$/;

/** The default warehouse lives on the dedicated `ProcurementSettings` table
 * (see below); the order numbering prefix has no column there, so it lives
 * in the generic `OrganizationModule.configuration` store instead. */
export async function getOrderNumberPrefix(organizationId: string) {
  const configuration = await getOrganizationModuleConfiguration(organizationId, "procurement");
  const configured = configuration.workflow.orderNumberPrefix;
  return configured && PREFIX_PATTERN.test(configured) ? configured : DEFAULT_ORDER_NUMBER_PREFIX;
}

export async function updateOrderNumberPrefix(organizationId: string, orderNumberPrefix: string, actorId?: string | null) {
  await updateOrganizationModuleConfigurationValues(organizationId, "procurement", { workflow: { orderNumberPrefix } }, actorId);
}

/**
 * Fresh module (no reference implementation to migrate from). Every function
 * takes organizationId explicitly and filters on it, per docs/MODULE_BOUNDARIES.md.
 *
 * Deliberate cross-module integration: receiving a purchase order line calls
 * Inventory's own recordMovement() to post a real RECEIPT — see
 * docs/DECISIONS.md's entry on this for why (a purchase order that doesn't
 * actually move stock isn't a real procurement flow). Procurement never
 * reaches into Inventory's tables directly, only its public service function.
 */

// --- Vendors ---

export function listVendors(organizationId: string) {
  return db.procurementVendor.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

interface VendorInput {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  active?: boolean;
}

export function createVendor(organizationId: string, data: VendorInput) {
  return db.procurementVendor.create({ data: { organizationId, ...data } });
}

export function updateVendor(organizationId: string, id: string, data: VendorInput) {
  return db.procurementVendor.update({ where: { id, organizationId }, data });
}

// --- Requests ---

async function generateRequestNumber(organizationId: string) {
  const count = await db.procurementRequest.count({ where: { organizationId } });
  return `PR-${String(count + 1).padStart(4, "0")}`;
}

export function listRequests(organizationId: string) {
  return db.procurementRequest.findMany({
    where: { organizationId },
    include: { item: true, requestedBy: true, approvedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

interface RequestInput {
  itemId?: string | null;
  description: string;
  quantity: number;
  estimatedCost?: string | null;
  notes?: string | null;
  requestedById?: string | null;
}

export async function createRequest(organizationId: string, data: RequestInput) {
  if (data.itemId) {
    const item = await db.inventoryItem.findFirst({ where: { id: data.itemId, organizationId } });
    if (!item) throw new NotFoundError("Item not found.");
  }

  return createWithUniqueRetry(async () => {
    const requestNumber = await generateRequestNumber(organizationId);
    return db.procurementRequest.create({ data: { organizationId, requestNumber, ...data } });
  });
}

export class RequestStateError extends Error {}

export async function approveRequest(organizationId: string, id: string, approvedById?: string | null) {
  const request = await db.procurementRequest.findFirst({ where: { id, organizationId } });
  if (!request) throw new NotFoundError("Request not found.");
  const claimed = await db.procurementRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "APPROVED", approvedById, approvedAt: new Date() },
  });
  if (claimed.count === 0) throw new RequestStateError("Only pending requests can be approved.");
  return db.procurementRequest.findUniqueOrThrow({ where: { id } });
}

export async function rejectRequest(organizationId: string, id: string, approvedById?: string | null) {
  const request = await db.procurementRequest.findFirst({ where: { id, organizationId } });
  if (!request) throw new NotFoundError("Request not found.");
  const claimed = await db.procurementRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", approvedById, approvedAt: new Date() },
  });
  if (claimed.count === 0) throw new RequestStateError("Only pending requests can be rejected.");
  return db.procurementRequest.findUniqueOrThrow({ where: { id } });
}

// --- Orders ---

async function generateOrderNumber(organizationId: string) {
  const [prefix, count] = await Promise.all([
    getOrderNumberPrefix(organizationId),
    db.procurementOrder.count({ where: { organizationId } }),
  ]);
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export function listOrders(organizationId: string) {
  return db.procurementOrder.findMany({
    where: { organizationId },
    include: { vendor: true, request: true, lines: { include: { item: true } }, createdBy: true },
    orderBy: { createdAt: "desc" },
  });
}

interface OrderLineInput {
  itemId?: string | null;
  description: string;
  quantity: number;
  unitCost: string;
}

interface OrderInput {
  vendorId: string;
  requestId?: string | null;
  orderDate: Date;
  expectedDate?: Date | null;
  notes?: string | null;
  createdById?: string | null;
  lines: OrderLineInput[];
}

export async function createOrder(organizationId: string, data: OrderInput) {
  const vendor = await db.procurementVendor.findFirst({ where: { id: data.vendorId, organizationId } });
  if (!vendor) throw new NotFoundError("Vendor not found.");

  if (data.requestId) {
    const request = await db.procurementRequest.findFirst({ where: { id: data.requestId, organizationId } });
    if (!request) throw new NotFoundError("Request not found.");
  }

  for (const line of data.lines) {
    if (!line.itemId) continue;
    const item = await db.inventoryItem.findFirst({ where: { id: line.itemId, organizationId } });
    if (!item) throw new NotFoundError("Item not found.");
  }

  // The whole transaction attempt is retried on an order-number collision
  // (not just the create call), regenerating orderNumber fresh each time.
  return createWithUniqueRetry(async () => {
    const orderNumber = await generateOrderNumber(organizationId);
    return db.$transaction(async (tx) => {
      const order = await tx.procurementOrder.create({
        data: {
          organizationId,
          orderNumber,
          vendorId: data.vendorId,
          requestId: data.requestId,
          orderDate: data.orderDate,
          expectedDate: data.expectedDate,
          notes: data.notes,
          createdById: data.createdById,
          lines: { create: data.lines },
        },
      });

      if (data.requestId) {
        await tx.procurementRequest.update({ where: { id: data.requestId }, data: { status: "CONVERTED" } });
      }

      return order;
    });
  });
}

export class OrderStateError extends Error {}

export async function sendOrder(organizationId: string, id: string) {
  const order = await db.procurementOrder.findFirst({ where: { id, organizationId } });
  if (!order) throw new NotFoundError("Order not found.");
  const claimed = await db.procurementOrder.updateMany({ where: { id, status: "DRAFT" }, data: { status: "SENT" } });
  if (claimed.count === 0) throw new OrderStateError("Only draft orders can be sent.");
  return db.procurementOrder.findUniqueOrThrow({ where: { id } });
}

/**
 * The atomic claim's WHERE clause only allows DRAFT/SENT — not
 * PARTIALLY_RECEIVED — so a concurrent receiveOrderLine() that's already
 * moved the order to PARTIALLY_RECEIVED can never lose this race. A prior
 * version guarded only against RECEIVED/CANCELLED here and relied on a
 * separate stale pre-transaction read of `order.lines` to reject a
 * partially-received order, which a concurrent receive landing between
 * that read and this claim could slip past — found while writing Pass 4's
 * concurrency tests (see docs/HARDENING_PLAN.md).
 */
export async function cancelOrder(organizationId: string, id: string) {
  const order = await db.procurementOrder.findFirst({ where: { id, organizationId } });
  if (!order) throw new NotFoundError("Order not found.");
  const claimed = await db.procurementOrder.updateMany({
    where: { id, status: { in: ["DRAFT", "SENT"] } },
    data: { status: "CANCELLED" },
  });
  if (claimed.count === 0) throw new OrderStateError("This order can no longer be cancelled.");
  return db.procurementOrder.findUniqueOrThrow({ where: { id } });
}

async function recomputeOrderStatus(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], orderId: string) {
  const lines = await tx.procurementOrderLine.findMany({ where: { orderId } });
  const allReceived = lines.every((l) => l.receivedQuantity >= l.quantity);
  const anyReceived = lines.some((l) => l.receivedQuantity > 0);
  const status: ProcurementOrderStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "SENT";
  await tx.procurementOrder.update({ where: { id: orderId }, data: { status } });
}

export class ReceiveQuantityError extends Error {}

/**
 * Thrown when an order line linked to a real InventoryItem is received
 * without a warehouse. A non-stock line (no itemId — an order for a service
 * or an untracked one-off item) never needs a warehouse, so this only fires
 * for the linked case. See docs/DECISIONS.md's 2026-08-14 entry: an earlier
 * version silently skipped the Inventory stock movement in this situation
 * while still marking the line received, leaving a purchase order that
 * claimed stock arrived when no InventoryStock row was ever touched.
 */
export class WarehouseRequiredError extends Error {}

/**
 * Receiving a line, posting its Inventory stock movement, and recomputing
 * the order's overall status now commit as one all-or-nothing transaction —
 * previously these were three separate statements, so a failure after the
 * stock movement posted (but before the line/order updated) left real stock
 * received with no record of it on the order, and a retry would receive it
 * again. The receivedQuantity update is also an atomic guarded increment
 * (WHERE receivedQuantity <= quantity - input.quantity), not a
 * read-then-absolute-write, so two concurrent receives against the same
 * line can't lose an update the way the previous JS-computed sum could.
 */
export async function receiveOrderLine(
  organizationId: string,
  input: { orderId: string; lineId: string; quantity: number; warehouseId?: string | null; createdById?: string | null },
) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ReceiveQuantityError("Quantity must be a positive whole number.");
  }

  const order = await db.procurementOrder.findFirst({ where: { id: input.orderId, organizationId } });
  if (!order) throw new NotFoundError("Order not found.");
  if (order.status !== "SENT" && order.status !== "PARTIALLY_RECEIVED") {
    throw new OrderStateError("Only sent or partially received orders can receive stock.");
  }

  const line = await db.procurementOrderLine.findFirst({ where: { id: input.lineId, orderId: input.orderId } });
  if (!line) throw new NotFoundError("Order line not found.");

  if (line.itemId && !input.warehouseId) {
    throw new WarehouseRequiredError("Select a warehouse to receive this item into stock.");
  }

  const remaining = line.quantity - line.receivedQuantity;
  if (input.quantity > remaining) {
    throw new ReceiveQuantityError(`Quantity must be between 1 and ${remaining}.`);
  }

  return db.$transaction(async (tx) => {
    const orderClaim = await tx.procurementOrder.updateMany({
      where: { id: input.orderId, organizationId, status: { in: ["SENT", "PARTIALLY_RECEIVED"] } },
      data: { status: "PARTIALLY_RECEIVED" },
    });
    if (orderClaim.count === 0) throw new OrderStateError("This order can no longer receive stock.");

    const claimed = await tx.procurementOrderLine.updateMany({
      where: { id: line.id, receivedQuantity: { lte: line.quantity - input.quantity } },
      data: { receivedQuantity: { increment: input.quantity } },
    });
    if (claimed.count === 0) {
      throw new ReceiveQuantityError("This line no longer has that much quantity remaining to receive.");
    }

    if (line.itemId && input.warehouseId) {
      await recordMovement(
        organizationId,
        {
          itemId: line.itemId,
          warehouseId: input.warehouseId,
          type: "RECEIPT",
          quantity: input.quantity,
          reference: order.orderNumber,
          notes: `Received against purchase order ${order.orderNumber}`,
          createdById: input.createdById,
        },
        tx,
      );
    }

    await recomputeOrderStatus(tx, input.orderId);
  });
}

// --- Settings ---

export function getSettings(organizationId: string) {
  return db.procurementSettings.findUnique({ where: { organizationId }, include: { defaultWarehouse: true } });
}

export function setDefaultWarehouse(organizationId: string, defaultWarehouseId: string | null) {
  return db.procurementSettings.upsert({
    where: { organizationId },
    update: { defaultWarehouseId },
    create: { organizationId, defaultWarehouseId },
  });
}

// --- Reports ---

export async function getProcurementSummary(organizationId: string) {
  const now = new Date();
  const [requests, orders, vendorCount, activeVendorCount] = await Promise.all([
    db.procurementRequest.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    db.procurementOrder.findMany({ where: { organizationId }, include: { lines: true, vendor: true }, orderBy: { createdAt: "desc" } }),
    db.procurementVendor.count({ where: { organizationId } }),
    db.procurementVendor.count({ where: { organizationId, active: true } }),
  ]);

  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const openOrders = orders.filter((o) => o.status === "SENT" || o.status === "PARTIALLY_RECEIVED");
  const openOrderValue = openOrders.reduce(
    (sum, o) => sum + o.lines.reduce((lineSum, l) => lineSum + (l.quantity - l.receivedQuantity) * Number(l.unitCost), 0),
    0,
  );
  // "Overdue" — an open order whose expected date has already passed and
  // still isn't fully received. Distinct from openOrderCount: every open
  // order is outstanding, but only some are actually late.
  const overdueOrders = openOrders.filter((o) => o.expectedDate !== null && o.expectedDate < now);

  return {
    pendingRequestCount: pendingRequests.length,
    totalRequestCount: requests.length,
    openOrderCount: openOrders.length,
    openOrderValue,
    overdueOrderCount: overdueOrders.length,
    receivedOrderCount: orders.filter((o) => o.status === "RECEIVED").length,
    totalOrderCount: orders.length,
    vendorCount,
    activeVendorCount,
    pendingRequestsPreview: pendingRequests.slice(0, 5).map((r) => ({
      id: r.id,
      requestNumber: r.requestNumber,
      description: r.description,
      quantity: r.quantity,
    })),
    overdueOrdersPreview: overdueOrders.slice(0, 5).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      vendorName: o.vendor.name,
      expectedDate: o.expectedDate as Date,
    })),
  };
}

export type { ProcurementRequestStatus };
