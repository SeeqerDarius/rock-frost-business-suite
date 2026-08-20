import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Mocked-db unit tests for src/modules/hostel/service.ts, focused on the
 * atomic-guard and validation logic - the same class of concurrency races
 * this codebase already covers for Fleet/School/Accounting (a bed claimed
 * twice, an allocation ended twice, a payment exceeding an invoice's
 * balance).
 */

const mockDb = {
  schoolStudent: { findFirst: vi.fn() },
  schoolAcademicYear: { findFirst: vi.fn() },
  schoolTerm: { findFirst: vi.fn() },
  hostelBuilding: { findFirst: vi.fn() },
  hostelRoom: { create: vi.fn() },
  hostelBed: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
  hostelAllocation: { findFirst: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  hostelFeeStructure: { findFirst: vi.fn(), count: vi.fn() },
  hostelFeeInvoice: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  hostelFeePayment: { create: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const hostel = await import("@/modules/hostel/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
});

describe("createHostelRoom", () => {
  it("rejects a capacity outside 1-20 without touching the database transaction", async () => {
    mockDb.hostelBuilding.findFirst.mockResolvedValue({ id: "b1", organizationId: ORG, active: true });
    await expect(hostel.createHostelRoom(ORG, { buildingId: "b1", roomNumber: "101", capacity: 0 })).rejects.toThrow(hostel.HostelStateError);
    await expect(hostel.createHostelRoom(ORG, { buildingId: "b1", roomNumber: "101", capacity: 21 })).rejects.toThrow(hostel.HostelStateError);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("creates the room and one bed per capacity, labeled A, B, C...", async () => {
    mockDb.hostelBuilding.findFirst.mockResolvedValue({ id: "b1", organizationId: ORG, active: true });
    mockDb.hostelRoom.create.mockResolvedValue({ id: "room-1" });
    await hostel.createHostelRoom(ORG, { buildingId: "b1", roomNumber: "101", capacity: 3 });
    expect(mockDb.hostelBed.createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: ORG, roomId: "room-1", label: "A" },
        { organizationId: ORG, roomId: "room-1", label: "B" },
        { organizationId: ORG, roomId: "room-1", label: "C" },
      ],
    });
  });
});

describe("createHostelAllocation", () => {
  const baseInput = { studentId: "student-1", bedId: "bed-1", academicYearId: "year-1", checkInDate: new Date("2026-09-01") };

  beforeEach(() => {
    mockDb.schoolStudent.findFirst.mockResolvedValue({ id: "student-1", organizationId: ORG, status: "ACTIVE" });
    mockDb.hostelBed.findFirst.mockResolvedValue({ id: "bed-1", organizationId: ORG });
    mockDb.schoolAcademicYear.findFirst.mockResolvedValue({ id: "year-1", organizationId: ORG });
  });

  it("rejects a student who already holds an active allocation", async () => {
    mockDb.hostelAllocation.findFirst.mockResolvedValue({ id: "existing-alloc" });
    await expect(hostel.createHostelAllocation(ORG, baseInput)).rejects.toThrow(hostel.HostelStateError);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("throws when the bed's AVAILABLE->OCCUPIED claim matches zero rows (concurrent allocation already took it)", async () => {
    mockDb.hostelAllocation.findFirst.mockResolvedValue(null);
    mockDb.hostelBed.updateMany.mockResolvedValue({ count: 0 });
    await expect(hostel.createHostelAllocation(ORG, baseInput)).rejects.toThrow(hostel.HostelStateError);
    expect(mockDb.hostelAllocation.create).not.toHaveBeenCalled();
  });

  it("claims the bed and creates the allocation when everything checks out", async () => {
    mockDb.hostelAllocation.findFirst.mockResolvedValue(null);
    mockDb.hostelBed.updateMany.mockResolvedValue({ count: 1 });
    mockDb.hostelAllocation.create.mockResolvedValue({ id: "alloc-1" });
    await hostel.createHostelAllocation(ORG, baseInput);
    expect(mockDb.hostelBed.updateMany).toHaveBeenCalledWith({ where: { id: "bed-1", organizationId: ORG, status: "AVAILABLE" }, data: { status: "OCCUPIED" } });
    expect(mockDb.hostelAllocation.create).toHaveBeenCalledWith({ data: { organizationId: ORG, ...baseInput } });
  });
});

describe("endHostelAllocation", () => {
  it("throws when the ACTIVE->ENDED claim matches zero rows (already ended)", async () => {
    mockDb.hostelAllocation.findFirst.mockResolvedValue({ id: "alloc-1", organizationId: ORG, bedId: "bed-1" });
    mockDb.hostelAllocation.updateMany.mockResolvedValue({ count: 0 });
    await expect(hostel.endHostelAllocation(ORG, "alloc-1", new Date())).rejects.toThrow(hostel.HostelStateError);
    expect(mockDb.hostelBed.update).not.toHaveBeenCalled();
  });

  it("frees the bed after successfully ending the allocation", async () => {
    mockDb.hostelAllocation.findFirst.mockResolvedValue({ id: "alloc-1", organizationId: ORG, bedId: "bed-1" });
    mockDb.hostelAllocation.updateMany.mockResolvedValue({ count: 1 });
    mockDb.hostelAllocation.findUniqueOrThrow.mockResolvedValue({ id: "alloc-1", status: "ENDED" });
    await hostel.endHostelAllocation(ORG, "alloc-1", new Date());
    expect(mockDb.hostelBed.update).toHaveBeenCalledWith({ where: { id: "bed-1" }, data: { status: "AVAILABLE" } });
  });
});

describe("recordHostelFeePayment", () => {
  it("rejects a payment that exceeds the invoice's outstanding balance", async () => {
    mockDb.hostelFeeInvoice.findFirst.mockResolvedValue({
      id: "inv-1", studentId: "student-1", amount: new Prisma.Decimal("100.00"), discount: new Prisma.Decimal("0"),
      payments: [{ amount: new Prisma.Decimal("80.00"), refundedAt: null }],
    });
    await expect(hostel.recordHostelFeePayment(ORG, "inv-1", { amount: "50.00", method: "CASH" })).rejects.toThrow(hostel.HostelStateError);
    expect(mockDb.hostelFeePayment.create).not.toHaveBeenCalled();
  });

  it("records the payment and marks the invoice PAID when it exactly settles the balance", async () => {
    mockDb.hostelFeeInvoice.findFirst.mockResolvedValue({
      id: "inv-1", studentId: "student-1", amount: new Prisma.Decimal("100.00"), discount: new Prisma.Decimal("0"), payments: [],
    });
    mockDb.hostelFeePayment.count.mockResolvedValue(0);
    mockDb.hostelFeePayment.create.mockResolvedValue({ id: "pay-1" });
    await hostel.recordHostelFeePayment(ORG, "inv-1", { amount: "100.00", method: "CASH" });
    expect(mockDb.hostelFeeInvoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PAID" } });
  });

  it("marks the invoice PART_PAID when the payment is less than the full balance", async () => {
    mockDb.hostelFeeInvoice.findFirst.mockResolvedValue({
      id: "inv-1", studentId: "student-1", amount: new Prisma.Decimal("100.00"), discount: new Prisma.Decimal("0"), payments: [],
    });
    mockDb.hostelFeePayment.count.mockResolvedValue(0);
    mockDb.hostelFeePayment.create.mockResolvedValue({ id: "pay-1" });
    await hostel.recordHostelFeePayment(ORG, "inv-1", { amount: "40.00", method: "CASH" });
    expect(mockDb.hostelFeeInvoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PART_PAID" } });
  });
});

describe("issueHostelFeeStructure", () => {
  it("skips students who already have an invoice from this structure", async () => {
    mockDb.hostelFeeStructure.findFirst.mockResolvedValue({ id: "struct-1", organizationId: ORG, active: true, academicYearId: "year-1", buildingId: null, termId: null, description: "Term fee", name: "Term fee", amount: "50.00", dueDate: null });
    mockDb.hostelAllocation.findMany.mockResolvedValue([{ id: "alloc-1", studentId: "student-1" }, { id: "alloc-2", studentId: "student-2" }]);
    mockDb.hostelFeeInvoice.findMany.mockResolvedValue([{ studentId: "student-1" }]);
    mockDb.hostelFeeInvoice.count.mockResolvedValue(0);
    mockDb.hostelFeeInvoice.create.mockResolvedValue({});

    const result = await hostel.issueHostelFeeStructure(ORG, "struct-1");
    expect(result).toEqual({ eligible: 2, issued: 1, skipped: 1 });
    expect(mockDb.hostelFeeInvoice.create).toHaveBeenCalledTimes(1);
  });
});
