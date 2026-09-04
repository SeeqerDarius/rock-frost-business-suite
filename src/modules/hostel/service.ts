import "server-only";

import { Prisma, type HostelBedStatus, type HotelPaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { createWithUniqueRetry } from "@/lib/unique-retry";

/**
 * A separately subscribable module for schools that also run a boarding
 * hostel. Occupants are existing SchoolStudent records - Hostel deliberately
 * owns no student identity, campus, or academic-calendar concept of its
 * own, borrowing School's (SchoolCampus, SchoolAcademicYear, SchoolTerm)
 * instead. Every query and mutation filters by organizationId, per
 * docs/MODULE_BOUNDARIES.md.
 */

export class HostelStateError extends Error {
  constructor(message: string, readonly code = "blocked") {
    super(message);
    this.name = "HostelStateError";
  }
}
export class HostelNotFoundError extends Error {}

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

async function nextCode(organizationId: string, prefix: string, count: () => Promise<number>) {
  return `${prefix}-${String((await count()) + 1).padStart(5, "0")}`;
}

// --- Buildings ---

export function listHostelBuildings(organizationId: string) {
  return db.hostelBuilding.findMany({
    where: { organizationId },
    include: { campus: true, _count: { select: { rooms: true, wardens: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export function createHostelBuilding(organizationId: string, data: { campusId?: string | null; code: string; name: string; genderPolicy?: string | null; address?: string | null }) {
  return db.hostelBuilding.create({ data: { organizationId, ...data } });
}

export function updateHostelBuilding(organizationId: string, id: string, data: { name: string; genderPolicy?: string | null; address?: string | null; active: boolean }) {
  return db.hostelBuilding.update({ where: { id, organizationId }, data });
}

// --- Rooms and beds ---

export function listHostelRooms(organizationId: string) {
  return db.hostelRoom.findMany({
    where: { organizationId },
    include: { building: true, beds: { include: { allocations: { where: { status: "ACTIVE" }, include: { student: true } } } } },
    orderBy: [{ building: { name: "asc" } }, { roomNumber: "asc" }],
  });
}

/** Creates the room and its beds (labeled A, B, C, ...) in one step - a hostel room's beds are fixed by its capacity, not managed as a separate later step. */
export async function createHostelRoom(organizationId: string, data: { buildingId: string; roomNumber: string; floor?: string | null; capacity: number }) {
  const building = await db.hostelBuilding.findFirst({ where: { id: data.buildingId, organizationId, active: true } });
  if (!building) throw new HostelNotFoundError("Building not found.");
  if (data.capacity < 1 || data.capacity > 20) throw new HostelStateError("Room capacity must be between 1 and 20 beds.");
  return db.$transaction(async (tx) => {
    const room = await tx.hostelRoom.create({ data: { organizationId, buildingId: data.buildingId, roomNumber: data.roomNumber, floor: data.floor, capacity: data.capacity } });
    await tx.hostelBed.createMany({
      data: Array.from({ length: data.capacity }, (_, index) => ({
        organizationId,
        roomId: room.id,
        label: String.fromCharCode(65 + index),
      })),
    });
    return room;
  });
}

export function updateHostelRoom(organizationId: string, id: string, data: { roomNumber: string; floor?: string | null; active: boolean }) {
  return db.hostelRoom.update({ where: { id, organizationId }, data });
}

export function setHostelBedStatus(organizationId: string, bedId: string, status: HostelBedStatus) {
  return db.hostelBed.update({ where: { id: bedId, organizationId }, data: { status } });
}

// --- Allocations ---

export function listHostelAllocations(organizationId: string) {
  return db.hostelAllocation.findMany({
    where: { organizationId },
    include: { student: true, bed: { include: { room: { include: { building: true } } } }, academicYear: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Claims a bed for a student atomically: the bed's AVAILABLE -> OCCUPIED
 * transition is a guarded updateMany (same pattern markInvoiceSent uses
 * for invoice status), so two concurrent allocation attempts for the same
 * bed can't both succeed. A student already holding an ACTIVE allocation
 * anywhere is blocked from a second one rather than silently double-booked.
 */
export async function createHostelAllocation(organizationId: string, data: { studentId: string; bedId: string; academicYearId: string; checkInDate: Date; notes?: string | null }) {
  const [student, bed, year] = await Promise.all([
    db.schoolStudent.findFirst({ where: { id: data.studentId, organizationId, status: "ACTIVE" } }),
    db.hostelBed.findFirst({ where: { id: data.bedId, organizationId } }),
    db.schoolAcademicYear.findFirst({ where: { id: data.academicYearId, organizationId } }),
  ]);
  if (!student || !bed || !year) throw new HostelNotFoundError("Active student, bed, or academic year not found.");

  const existing = await db.hostelAllocation.findFirst({ where: { organizationId, studentId: data.studentId, status: "ACTIVE" } });
  if (existing) throw new HostelStateError("This student already has an active hostel allocation.", "already-allocated");

  return db.$transaction(async (tx) => {
    const claimed = await tx.hostelBed.updateMany({ where: { id: data.bedId, organizationId, status: "AVAILABLE" }, data: { status: "OCCUPIED" } });
    if (claimed.count === 0) throw new HostelStateError("That bed is no longer available.", "bed-unavailable");
    return tx.hostelAllocation.create({ data: { organizationId, ...data } });
  });
}

/** Ends an allocation and frees the bed - the reverse guarded transition, claimed off the allocation's own ACTIVE -> ENDED status rather than the bed's, since the bed row doesn't know which allocation currently holds it. */
export async function endHostelAllocation(organizationId: string, id: string, checkOutDate: Date) {
  const allocation = await db.hostelAllocation.findFirst({ where: { id, organizationId } });
  if (!allocation) throw new HostelNotFoundError("Allocation not found.");

  return db.$transaction(async (tx) => {
    const claimed = await tx.hostelAllocation.updateMany({ where: { id, organizationId, status: "ACTIVE" }, data: { status: "ENDED", checkOutDate } });
    if (claimed.count === 0) throw new HostelStateError("This allocation has already ended.");
    await tx.hostelBed.update({ where: { id: allocation.bedId }, data: { status: "AVAILABLE" } });
    return tx.hostelAllocation.findUniqueOrThrow({ where: { id } });
  });
}

// --- Wardens ---

export function listHostelWardens(organizationId: string) {
  return db.hostelWarden.findMany({ where: { organizationId }, include: { building: true, user: true }, orderBy: { createdAt: "desc" } });
}

/**
 * Active org members who can actually be assigned as a hostel warden - only
 * those whose role carries a Hostel permission, not every active member of
 * the organization (which previously let e.g. a Fleet driver or Hospital
 * radiology staffer show up in the warden picker). Mirrors the same fix
 * applied to Fleet's driver/owner/mechanic lists and School's teacher list.
 */
export function listAssignableHostelUsers(organizationId: string) {
  return db.organizationMember.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      role: { rolePermissions: { some: { permission: { key: { startsWith: "hostel." } } } } },
    },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  }).then((memberships) => memberships.map(({ user }) => user));
}

export async function assignHostelWarden(organizationId: string, data: { buildingId: string; userId: string; title?: string | null }) {
  const building = await db.hostelBuilding.findFirst({ where: { id: data.buildingId, organizationId, active: true } });
  if (!building) throw new HostelNotFoundError("Building not found.");
  return db.hostelWarden.create({ data: { organizationId, ...data } });
}

export async function removeHostelWarden(organizationId: string, id: string) {
  const result = await db.hostelWarden.deleteMany({ where: { id, organizationId } });
  if (result.count === 0) throw new HostelNotFoundError("Warden assignment not found.");
}

// --- Fee structures and billing ---

export function listHostelFeeStructures(organizationId: string) {
  return db.hostelFeeStructure.findMany({
    where: { organizationId },
    include: { building: true, academicYear: true, term: true, _count: { select: { invoices: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
}

export async function createHostelFeeStructure(organizationId: string, data: { buildingId?: string | null; academicYearId: string; termId?: string | null; name: string; description?: string | null; amount: Prisma.Decimal.Value; dueDate?: Date | null }) {
  const [building, year, term] = await Promise.all([
    data.buildingId ? db.hostelBuilding.findFirst({ where: { id: data.buildingId, organizationId, active: true } }) : Promise.resolve(true),
    db.schoolAcademicYear.findFirst({ where: { id: data.academicYearId, organizationId } }),
    data.termId ? db.schoolTerm.findFirst({ where: { id: data.termId, organizationId, academicYearId: data.academicYearId } }) : Promise.resolve(true),
  ]);
  if (!building || !year || !term) throw new HostelNotFoundError("Building, academic year, or term not found.");
  const amount = decimal(data.amount);
  if (amount.lte(0)) throw new HostelStateError("Fee amount must be greater than zero.");
  return db.hostelFeeStructure.create({ data: { organizationId, ...data, amount } });
}

/**
 * Bulk-issues one invoice per eligible ACTIVE allocation (scoped to the
 * structure's building, when set) that doesn't already have an invoice
 * from this structure - the same shape as School's issueSchoolFeeStructure,
 * an advisory-locked count-then-create loop rather than a bulk insert, so
 * invoice numbers stay sequential and gap-free.
 */
export async function issueHostelFeeStructure(organizationId: string, feeStructureId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:hostel-invoice`}))`;
    const structure = await tx.hostelFeeStructure.findFirst({ where: { id: feeStructureId, organizationId, active: true } });
    if (!structure) throw new HostelNotFoundError("Active fee structure not found.");

    const allocations = await tx.hostelAllocation.findMany({
      where: {
        organizationId,
        academicYearId: structure.academicYearId,
        status: "ACTIVE",
        ...(structure.buildingId ? { bed: { room: { buildingId: structure.buildingId } } } : {}),
      },
      select: { id: true, studentId: true },
    });
    const alreadyIssued = new Set((await tx.hostelFeeInvoice.findMany({
      where: { organizationId, feeStructureId, studentId: { in: allocations.map((row) => row.studentId) } },
      select: { studentId: true },
    })).map((row) => row.studentId));
    const recipients = allocations.filter((row) => !alreadyIssued.has(row.studentId));
    const startingCount = await tx.hostelFeeInvoice.count({ where: { organizationId } });
    for (const [index, allocation] of recipients.entries()) {
      await tx.hostelFeeInvoice.create({
        data: {
          organizationId,
          feeStructureId,
          academicYearId: structure.academicYearId,
          termId: structure.termId,
          studentId: allocation.studentId,
          allocationId: allocation.id,
          invoiceNumber: `HINV-${String(startingCount + index + 1).padStart(5, "0")}`,
          description: structure.description || structure.name,
          amount: structure.amount,
          status: "ISSUED",
          issuedAt: new Date(),
          dueDate: structure.dueDate,
        },
      });
    }
    return { eligible: allocations.length, issued: recipients.length, skipped: alreadyIssued.size };
  });
}

export function listHostelFeeInvoices(organizationId: string) {
  return db.hostelFeeInvoice.findMany({ where: { organizationId }, include: { student: true, payments: true, academicYear: true, term: true }, orderBy: { createdAt: "desc" } });
}

export async function createHostelFeeInvoice(organizationId: string, data: { academicYearId: string; termId?: string | null; studentId: string; allocationId?: string | null; description: string; amount: Prisma.Decimal.Value; discount?: Prisma.Decimal.Value; dueDate?: Date | null }) {
  const [student, year, term] = await Promise.all([
    db.schoolStudent.findFirst({ where: { id: data.studentId, organizationId } }),
    db.schoolAcademicYear.findFirst({ where: { id: data.academicYearId, organizationId } }),
    data.termId ? db.schoolTerm.findFirst({ where: { id: data.termId, organizationId, academicYearId: data.academicYearId } }) : Promise.resolve(true),
  ]);
  if (!student || !year || !term) throw new HostelNotFoundError("Student or academic period not found.");
  if (decimal(data.amount).lte(0) || decimal(data.discount ?? 0).lt(0) || decimal(data.discount ?? 0).gt(data.amount)) throw new HostelStateError("Invalid fee amount or discount.");
  return createWithUniqueRetry(async () => db.hostelFeeInvoice.create({ data: { organizationId, invoiceNumber: await nextCode(organizationId, "HINV", () => db.hostelFeeInvoice.count({ where: { organizationId } })), ...data, amount: decimal(data.amount), discount: decimal(data.discount ?? 0), status: "ISSUED", issuedAt: new Date() } }));
}

/** Records a payment against an open invoice - same row-serialized (advisory lock), Decimal-balance-checked shape as recordSchoolFeePayment. */
export async function recordHostelFeePayment(organizationId: string, invoiceId: string, data: { amount: Prisma.Decimal.Value; method: HotelPaymentMethod; reference?: string | null }) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:hostel-receipt`}))`;
    const invoice = await tx.hostelFeeInvoice.findFirst({ where: { id: invoiceId, organizationId, status: { in: ["ISSUED", "PART_PAID"] } }, include: { payments: true } });
    if (!invoice) throw new HostelNotFoundError("Open invoice not found.");
    const paid = invoice.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const due = invoice.amount.minus(invoice.discount).minus(paid);
    const amount = decimal(data.amount);
    if (amount.lte(0) || amount.gt(due)) throw new HostelStateError("Payment exceeds the outstanding invoice balance.", "payment-exceeds-balance");
    const payment = await tx.hostelFeePayment.create({ data: { organizationId, invoiceId, studentId: invoice.studentId, receiptNumber: await nextCode(organizationId, "HRCT", () => tx.hostelFeePayment.count({ where: { organizationId } })), ...data, amount } });
    await tx.hostelFeeInvoice.update({ where: { id: invoiceId }, data: { status: amount.eq(due) ? "PAID" : "PART_PAID" } });
    return payment;
  });
}

// --- Reports ---

export async function getHostelSummary(organizationId: string) {
  const [buildingCount, roomCount, beds, activeAllocationCount, wardenCount, invoices] = await Promise.all([
    db.hostelBuilding.count({ where: { organizationId, active: true } }),
    db.hostelRoom.count({ where: { organizationId, active: true } }),
    db.hostelBed.findMany({ where: { organizationId } }),
    db.hostelAllocation.count({ where: { organizationId, status: "ACTIVE" } }),
    db.hostelWarden.count({ where: { organizationId } }),
    db.hostelFeeInvoice.findMany({ where: { organizationId }, include: { payments: true } }),
  ]);

  const occupiedBeds = beds.filter((b) => b.status === "OCCUPIED").length;
  const availableBeds = beds.filter((b) => b.status === "AVAILABLE").length;
  const outstandingInvoices = invoices.filter((i) => i.status === "ISSUED" || i.status === "PART_PAID");
  const outstandingTotal = outstandingInvoices.reduce((sum, invoice) => {
    const paid = invoice.payments.filter((p) => !p.refundedAt).reduce((total, p) => total.plus(p.amount), new Prisma.Decimal(0));
    return sum.plus(invoice.amount).minus(invoice.discount).minus(paid);
  }, new Prisma.Decimal(0));

  return {
    buildingCount,
    roomCount,
    totalBeds: beds.length,
    occupiedBeds,
    availableBeds,
    activeAllocationCount,
    wardenCount,
    outstandingInvoiceCount: outstandingInvoices.length,
    outstandingInvoiceTotal: outstandingTotal.toNumber(),
    invoiceCount: invoices.length,
  };
}
