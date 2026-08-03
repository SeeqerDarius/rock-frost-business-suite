import "server-only";

import { Prisma, type HotelHousekeepingStatus, type HotelPaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { createWithUniqueRetry } from "@/lib/unique-retry";

export class HotelStateError extends Error {}
export class HotelNotFoundError extends Error {}

const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

async function nextCode(organizationId: string, prefix: string, count: () => Promise<number>) {
  return `${prefix}-${String((await count()) + 1).padStart(5, "0")}`;
}

export function listHotelProperties(organizationId: string) {
  return db.hotelProperty.findMany({ where: { organizationId }, include: { _count: { select: { rooms: true } } }, orderBy: { name: "asc" } });
}

export function createHotelProperty(organizationId: string, data: { code: string; name: string; address?: string | null; phone?: string | null; email?: string | null; timezone?: string; currency?: string }) {
  return db.hotelProperty.create({ data: { organizationId, ...data } });
}

export async function createHotelRoomType(organizationId: string, data: { propertyId: string; code: string; name: string; capacity: number; baseRate: Prisma.Decimal.Value; description?: string | null }) {
  const property = await db.hotelProperty.findFirst({ where: { id: data.propertyId, organizationId, active: true } });
  if (!property) throw new HotelNotFoundError("Property not found.");
  return db.hotelRoomType.create({ data: { organizationId, ...data, baseRate: money(data.baseRate) } });
}

export function listHotelRooms(organizationId: string) {
  return db.hotelRoom.findMany({ where: { organizationId }, include: { property: true, roomType: true }, orderBy: [{ property: { name: "asc" } }, { number: "asc" }] });
}

export function listHotelRoomTypes(organizationId: string) {
  return db.hotelRoomType.findMany({ where: { organizationId, active: true }, include: { property: true }, orderBy: { name: "asc" } });
}

export async function createHotelRoom(organizationId: string, data: { propertyId: string; roomTypeId: string; number: string; floor?: string | null }) {
  const roomType = await db.hotelRoomType.findFirst({ where: { id: data.roomTypeId, organizationId, propertyId: data.propertyId, active: true } });
  if (!roomType) throw new HotelNotFoundError("Room type not found.");
  return db.hotelRoom.create({ data: { organizationId, ...data } });
}

export function listHotelGuests(organizationId: string) {
  return db.hotelGuest.findMany({ where: { organizationId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
}

export function createHotelGuest(organizationId: string, data: { firstName: string; lastName: string; email?: string | null; phone?: string | null; nationality?: string | null; identityType?: string | null; identityNumber?: string | null; notes?: string | null }) {
  return createWithUniqueRetry(async () => db.hotelGuest.create({ data: { organizationId, guestNumber: await nextCode(organizationId, "GST", () => db.hotelGuest.count({ where: { organizationId } })), ...data } }));
}

export function listHotelReservations(organizationId: string) {
  return db.hotelReservation.findMany({ where: { organizationId }, include: { property: true, roomType: true, room: true, guest: true, folio: { include: { entries: true, payments: true } } }, orderBy: { arrivalDate: "desc" } });
}

export async function createHotelReservation(organizationId: string, data: { propertyId: string; roomTypeId: string; roomId?: string | null; guestId: string; arrivalDate: Date; departureDate: Date; adults: number; children?: number; nightlyRate: Prisma.Decimal.Value; source?: string | null; specialRequests?: string | null }) {
  if (data.departureDate <= data.arrivalDate) throw new HotelStateError("Departure must be after arrival.");
  const [property, roomType, guest] = await Promise.all([
    db.hotelProperty.findFirst({ where: { id: data.propertyId, organizationId, active: true } }),
    db.hotelRoomType.findFirst({ where: { id: data.roomTypeId, organizationId, propertyId: data.propertyId, active: true } }),
    db.hotelGuest.findFirst({ where: { id: data.guestId, organizationId } }),
  ]);
  if (!property || !roomType || !guest) throw new HotelNotFoundError("Property, room type, or guest not found.");
  if (data.adults + (data.children ?? 0) > roomType.capacity) throw new HotelStateError("Guest count exceeds room capacity.");
  if (data.roomId) await assertRoomAvailable(organizationId, data.roomId, data.arrivalDate, data.departureDate);
  return createWithUniqueRetry(async () => db.hotelReservation.create({ data: { organizationId, confirmationCode: await nextCode(organizationId, "RSV", () => db.hotelReservation.count({ where: { organizationId } })), ...data, nightlyRate: money(data.nightlyRate), status: "CONFIRMED" } }));
}

async function assertRoomAvailable(organizationId: string, roomId: string, arrivalDate: Date, departureDate: Date, excludeReservationId?: string) {
  const room = await db.hotelRoom.findFirst({ where: { id: roomId, organizationId, active: true, status: { not: "OUT_OF_SERVICE" } } });
  if (!room) throw new HotelNotFoundError("Room not found.");
  const conflict = await db.hotelReservation.findFirst({ where: { organizationId, roomId, id: excludeReservationId ? { not: excludeReservationId } : undefined, status: { in: ["CONFIRMED", "CHECKED_IN"] }, arrivalDate: { lt: departureDate }, departureDate: { gt: arrivalDate } } });
  if (conflict) throw new HotelStateError("Room is already reserved for those dates.");
  return room;
}

export async function checkInHotelReservation(organizationId: string, reservationId: string, roomId: string) {
  const reservation = await db.hotelReservation.findFirst({ where: { id: reservationId, organizationId }, include: { folio: true } });
  if (!reservation) throw new HotelNotFoundError("Reservation not found.");
  if (reservation.status !== "CONFIRMED") throw new HotelStateError("Only confirmed reservations can check in.");
  const room = await assertRoomAvailable(organizationId, roomId, reservation.arrivalDate, reservation.departureDate, reservation.id);
  if (room.roomTypeId !== reservation.roomTypeId || room.propertyId !== reservation.propertyId) throw new HotelStateError("Room does not match the reserved property and room type.");
  return db.$transaction(async (tx) => {
    const claimed = await tx.hotelRoom.updateMany({ where: { id: roomId, organizationId, status: { in: ["AVAILABLE", "RESERVED"] } }, data: { status: "OCCUPIED" } });
    if (claimed.count !== 1) throw new HotelStateError("Room is no longer available.");
    const updated = await tx.hotelReservation.update({ where: { id: reservationId }, data: { roomId, status: "CHECKED_IN", checkedInAt: new Date() } });
    if (!reservation.folio) {
      const folio = await tx.hotelFolio.create({ data: { organizationId, reservationId, folioNumber: await nextCode(organizationId, "FOL", () => tx.hotelFolio.count({ where: { organizationId } })) } });
      const nights = Math.max(1, Math.ceil((reservation.departureDate.getTime() - reservation.arrivalDate.getTime()) / 86_400_000));
      await tx.hotelFolioEntry.create({ data: { organizationId, folioId: folio.id, type: "CHARGE", description: `Accommodation (${nights} night${nights === 1 ? "" : "s"})`, amount: reservation.nightlyRate.mul(nights), reference: reservation.confirmationCode } });
    }
    return updated;
  });
}

export async function postHotelFolioCharge(organizationId: string, folioId: string, data: { description: string; amount: Prisma.Decimal.Value; reference?: string | null }) {
  const folio = await db.hotelFolio.findFirst({ where: { id: folioId, organizationId, closedAt: null } });
  if (!folio) throw new HotelNotFoundError("Open folio not found.");
  if (money(data.amount).lte(0)) throw new HotelStateError("Charge must be greater than zero.");
  return db.hotelFolioEntry.create({ data: { organizationId, folioId, type: "CHARGE", ...data, amount: money(data.amount) } });
}

export async function recordHotelPayment(organizationId: string, folioId: string, data: { amount: Prisma.Decimal.Value; method: HotelPaymentMethod; reference?: string | null }) {
  const folio = await db.hotelFolio.findFirst({ where: { id: folioId, organizationId, closedAt: null } });
  if (!folio) throw new HotelNotFoundError("Open folio not found.");
  if (money(data.amount).lte(0)) throw new HotelStateError("Payment must be greater than zero.");
  return createWithUniqueRetry(async () => db.hotelPayment.create({ data: { organizationId, folioId, receiptNumber: await nextCode(organizationId, "HRC", () => db.hotelPayment.count({ where: { organizationId } })), ...data, amount: money(data.amount) } }));
}

export async function getHotelFolioBalance(organizationId: string, folioId: string) {
  const folio = await db.hotelFolio.findFirst({ where: { id: folioId, organizationId }, include: { entries: true, payments: true } });
  if (!folio) throw new HotelNotFoundError("Folio not found.");
  const charges = folio.entries.reduce((sum, entry) => sum.plus(entry.type === "REFUND" ? entry.amount.negated() : entry.amount), new Prisma.Decimal(0));
  const payments = folio.payments.filter((payment) => !payment.refundedAt).reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
  return { folio, charges, payments, balance: charges.minus(payments) };
}

export async function checkOutHotelReservation(organizationId: string, reservationId: string) {
  const reservation = await db.hotelReservation.findFirst({ where: { id: reservationId, organizationId }, include: { folio: true, property: { include: { settings: true } } } });
  if (!reservation || !reservation.folio || !reservation.roomId) throw new HotelNotFoundError("Checked-in reservation not found.");
  if (reservation.status !== "CHECKED_IN") throw new HotelStateError("Only checked-in reservations can check out.");
  const { balance } = await getHotelFolioBalance(organizationId, reservation.folio.id);
  if (balance.gt(0) && !reservation.property.settings?.allowOutstandingCheckout) throw new HotelStateError("The folio has an outstanding balance.");
  return db.$transaction(async (tx) => {
    await tx.hotelFolio.update({ where: { id: reservation.folio!.id }, data: { closedAt: new Date() } });
    await tx.hotelRoom.update({ where: { id: reservation.roomId! }, data: { status: "DIRTY" } });
    await tx.hotelHousekeepingTask.create({ data: { organizationId, roomId: reservation.roomId!, status: "PENDING", priority: "CHECKOUT" } });
    return tx.hotelReservation.update({ where: { id: reservationId }, data: { status: "CHECKED_OUT", checkedOutAt: new Date() } });
  });
}

export function listHotelHousekeepingTasks(organizationId: string) {
  return db.hotelHousekeepingTask.findMany({ where: { organizationId }, include: { room: { include: { property: true } } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }] });
}

export function listOpenHotelFolios(organizationId: string) {
  return db.hotelFolio.findMany({ where: { organizationId, closedAt: null }, include: { reservation: { include: { guest: true, room: true } }, entries: true, payments: true }, orderBy: { createdAt: "desc" } });
}

export async function updateHotelHousekeepingTask(organizationId: string, id: string, status: HotelHousekeepingStatus, assignedTo?: string | null) {
  const task = await db.hotelHousekeepingTask.findFirst({ where: { id, organizationId }, include: { room: true } });
  if (!task) throw new HotelNotFoundError("Housekeeping task not found.");
  return db.$transaction(async (tx) => {
    const updated = await tx.hotelHousekeepingTask.update({ where: { id }, data: { status, assignedTo, completedAt: status === "COMPLETED" ? new Date() : task.completedAt, inspectedAt: status === "COMPLETED" ? new Date() : task.inspectedAt } });
    if (status === "COMPLETED" && task.room.status !== "OUT_OF_SERVICE") await tx.hotelRoom.update({ where: { id: task.roomId }, data: { status: "AVAILABLE" } });
    else if (status === "IN_PROGRESS") await tx.hotelRoom.updateMany({ where: { id: task.roomId, status: { not: "OUT_OF_SERVICE" } }, data: { status: "CLEANING" } });
    return updated;
  });
}

export async function getHotelSummary(organizationId: string) {
  const [rooms, reservations, openFolios, housekeeping, orders] = await Promise.all([
    db.hotelRoom.findMany({ where: { organizationId, active: true } }),
    db.hotelReservation.findMany({ where: { organizationId } }),
    db.hotelFolio.findMany({ where: { organizationId, closedAt: null }, include: { entries: true, payments: true } }),
    db.hotelHousekeepingTask.count({ where: { organizationId, status: { not: "COMPLETED" } } }),
    db.hotelOrder.count({ where: { organizationId, status: { in: ["OPEN", "PREPARING", "SERVED"] } } }),
  ]);
  const outstanding = openFolios.reduce((total, folio) => total.plus(folio.entries.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))).minus(folio.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0))), new Prisma.Decimal(0));
  return { totalRooms: rooms.length, occupiedRooms: rooms.filter((r) => r.status === "OCCUPIED").length, arrivals: reservations.filter((r) => r.status === "CONFIRMED").length, inHouse: reservations.filter((r) => r.status === "CHECKED_IN").length, openFolios: openFolios.length, outstanding, housekeeping, openOrders: orders };
}

export function listHotelRestaurantData(organizationId: string) {
  return Promise.all([
    db.hotelRestaurantOutlet.findMany({ where: { organizationId }, include: { menuItems: true }, orderBy: { name: "asc" } }),
    db.hotelOrder.findMany({ where: { organizationId }, include: { outlet: true, folio: true, lines: true }, orderBy: { openedAt: "desc" }, take: 100 }),
  ]);
}

export async function createHotelRestaurantOutlet(organizationId: string, propertyId: string, name: string) {
  const property = await db.hotelProperty.findFirst({ where: { id: propertyId, organizationId } });
  if (!property) throw new HotelNotFoundError("Property not found.");
  return db.hotelRestaurantOutlet.create({ data: { organizationId, propertyId, name } });
}

export async function createHotelMenuItem(organizationId: string, outletId: string, data: { name: string; category?: string | null; price: Prisma.Decimal.Value }) {
  const outlet = await db.hotelRestaurantOutlet.findFirst({ where: { id: outletId, organizationId } });
  if (!outlet) throw new HotelNotFoundError("Outlet not found.");
  return db.hotelMenuItem.create({ data: { organizationId, outletId, ...data, price: money(data.price) } });
}

export async function createHotelOrder(organizationId: string, data: { outletId: string; folioId?: string | null; tableOrRoom?: string | null; menuItemId: string; quantity: number }) {
  const item = await db.hotelMenuItem.findFirst({ where: { id: data.menuItemId, organizationId, outletId: data.outletId, active: true } });
  if (!item || data.quantity < 1) throw new HotelNotFoundError("Menu item not found.");
  if (data.folioId && !(await db.hotelFolio.findFirst({ where: { id: data.folioId, organizationId, closedAt: null } }))) throw new HotelNotFoundError("Open folio not found.");
  return createWithUniqueRetry(async () => db.$transaction(async (tx) => {
    const total = item.price.mul(data.quantity);
    const order = await tx.hotelOrder.create({ data: { organizationId, outletId: data.outletId, folioId: data.folioId, tableOrRoom: data.tableOrRoom, orderNumber: await nextCode(organizationId, "ORD", () => tx.hotelOrder.count({ where: { organizationId } })), total, lines: { create: { organizationId, menuItemId: item.id, description: item.name, quantity: data.quantity, unitPrice: item.price, lineTotal: total } } } });
    if (data.folioId) await tx.hotelFolioEntry.create({ data: { organizationId, folioId: data.folioId, type: "CHARGE", description: `Restaurant order ${order.orderNumber}`, amount: total, reference: order.orderNumber } });
    return order;
  }));
}

export function listHotelChannels(organizationId: string) {
  return db.hotelChannel.findMany({ where: { organizationId }, include: { property: true }, orderBy: { provider: "asc" } });
}

export async function upsertHotelChannel(organizationId: string, data: { propertyId: string; provider: string; externalPropertyId?: string | null; active: boolean }) {
  if (!(await db.hotelProperty.findFirst({ where: { id: data.propertyId, organizationId } }))) throw new HotelNotFoundError("Property not found.");
  return db.hotelChannel.upsert({ where: { propertyId_provider: { propertyId: data.propertyId, provider: data.provider } }, update: { externalPropertyId: data.externalPropertyId, active: data.active }, create: { organizationId, ...data } });
}

export function listHotelSettings(organizationId: string) {
  return db.hotelProperty.findMany({ where: { organizationId }, include: { settings: true }, orderBy: { name: "asc" } });
}

export async function upsertHotelSettings(organizationId: string, data: { propertyId: string; checkInTime: string; checkOutTime: string; taxRate: Prisma.Decimal.Value; serviceChargeRate: Prisma.Decimal.Value; allowOutstandingCheckout: boolean }) {
  if (!(await db.hotelProperty.findFirst({ where: { id: data.propertyId, organizationId } }))) throw new HotelNotFoundError("Property not found.");
  const values = { checkInTime: data.checkInTime, checkOutTime: data.checkOutTime, taxRate: money(data.taxRate), serviceChargeRate: money(data.serviceChargeRate), allowOutstandingCheckout: data.allowOutstandingCheckout };
  return db.hotelSettings.upsert({ where: { propertyId: data.propertyId }, update: values, create: { organizationId, propertyId: data.propertyId, ...values } });
}
