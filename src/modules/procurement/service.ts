import "server-only";

import { db } from "@/lib/db";
import { recordMovement } from "@/modules/inventory/service";
import type { ProcurementRequestStatus, ProcurementOrderStatus } from "@prisma/client";

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
  const requestNumber = await generateRequestNumber(organizationId);
  return db.procurementRequest.create({ data: { organizationId, requestNumber, ...data } });
}

export class RequestStateError extends Error {}

export async function approveRequest(organizationId: string, id: string, approvedById?: string | null) {
  const request = await db.procurementRequest.findFirst({ where: { id, organizationId } });
  if (!request) throw new Error("Request not found.");
  if (request.status !== "PENDING") throw new RequestStateError("Only pending requests can be approved.");
  return db.procurementRequest.update({ where: { id }, data: { status: "APPROVED", approvedById, approvedAt: new Date() } });
}

export async function rejectRequest(organizationId: string, id: string, approvedById?: string | null) {
  const request = await db.procurementRequest.findFirst({ where: { id, organizationId } });
  if (!request) throw new Error("Request not found.");
  if (request.status !== "PENDING") throw new RequestStateError("Only pending requests can be rejected.");
  return db.procurementRequest.update({ where: { id }, data: { status: "REJECTED", approvedById, approvedAt: new Date() } });
}

// --- Orders ---

async function generateOrderNumber(organizationId: string) {
  const count = await db.procurementOrder.count({ where: { organizationId } });
  return `PO-${String(count + 1).padStart(4, "0")}`;
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
  const orderNumber = await generateOrderNumber(organizationId);
  const order = await db.procurementOrder.create({
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
    await db.procurementRequest.update({ where: { id: data.requestId }, data: { status: "CONVERTED" } });
  }

  return order;
}

export class OrderStateError extends Error {}

export async function sendOrder(organizationId: string, id: string) {
  const order = await db.procurementOrder.findFirst({ where: { id, organizationId } });
  if (!order) throw new Error("Order not found.");
  if (order.status !== "DRAFT") throw new OrderStateError("Only draft orders can be sent.");
  return db.procurementOrder.update({ where: { id }, data: { status: "SENT" } });
}

export async function cancelOrder(organizationId: string, id: string) {
  const order = await db.procurementOrder.findFirst({ where: { id, organizationId }, include: { lines: true } });
  if (!order) throw new Error("Order not found.");
  if (order.lines.some((l) => l.receivedQuantity > 0)) {
    throw new OrderStateError("Cannot cancel an order that has already received stock.");
  }
  if (order.status === "RECEIVED" || order.status === "CANCELLED") {
    throw new OrderStateError("This order can no longer be cancelled.");
  }
  return db.procurementOrder.update({ where: { id }, data: { status: "CANCELLED" } });
}

async function recomputeOrderStatus(orderId: string) {
  const lines = await db.procurementOrderLine.findMany({ where: { orderId } });
  const allReceived = lines.every((l) => l.receivedQuantity >= l.quantity);
  const anyReceived = lines.some((l) => l.receivedQuantity > 0);
  const status: ProcurementOrderStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "SENT";
  await db.procurementOrder.update({ where: { id: orderId }, data: { status } });
}

export class ReceiveQuantityError extends Error {}

export async function receiveOrderLine(
  organizationId: string,
  input: { orderId: string; lineId: string; quantity: number; warehouseId?: string | null; createdById?: string | null },
) {
  const order = await db.procurementOrder.findFirst({ where: { id: input.orderId, organizationId } });
  if (!order) throw new Error("Order not found.");
  if (order.status !== "SENT" && order.status !== "PARTIALLY_RECEIVED") {
    throw new OrderStateError("Only sent or partially received orders can receive stock.");
  }

  const line = await db.procurementOrderLine.findFirst({ where: { id: input.lineId, orderId: input.orderId } });
  if (!line) throw new Error("Order line not found.");

  const remaining = line.quantity - line.receivedQuantity;
  if (input.quantity <= 0 || input.quantity > remaining) {
    throw new ReceiveQuantityError(`Quantity must be between 1 and ${remaining}.`);
  }

  if (line.itemId && input.warehouseId) {
    await recordMovement(organizationId, {
      itemId: line.itemId,
      warehouseId: input.warehouseId,
      type: "RECEIPT",
      quantity: input.quantity,
      reference: order.orderNumber,
      notes: `Received against purchase order ${order.orderNumber}`,
      createdById: input.createdById,
    });
  }

  await db.procurementOrderLine.update({
    where: { id: line.id },
    data: { receivedQuantity: line.receivedQuantity + input.quantity },
  });

  await recomputeOrderStatus(input.orderId);
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
  const [requests, orders] = await Promise.all([
    db.procurementRequest.findMany({ where: { organizationId } }),
    db.procurementOrder.findMany({ where: { organizationId }, include: { lines: true } }),
  ]);

  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const openOrders = orders.filter((o) => o.status === "SENT" || o.status === "PARTIALLY_RECEIVED");
  const openOrderValue = openOrders.reduce(
    (sum, o) => sum + o.lines.reduce((lineSum, l) => lineSum + (l.quantity - l.receivedQuantity) * Number(l.unitCost), 0),
    0,
  );

  return {
    pendingRequestCount: pendingRequests.length,
    totalRequestCount: requests.length,
    openOrderCount: openOrders.length,
    openOrderValue,
    receivedOrderCount: orders.filter((o) => o.status === "RECEIVED").length,
    totalOrderCount: orders.length,
  };
}

export type { ProcurementRequestStatus };
