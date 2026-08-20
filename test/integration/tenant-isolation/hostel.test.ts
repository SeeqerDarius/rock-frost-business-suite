import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as hostel from "@/modules/hostel/service";
import * as school from "@/modules/school/service";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

let orgA: TestOrg;
let orgB: TestOrg;
let campusA: Awaited<ReturnType<typeof school.createSchoolCampus>>;
let studentA: Awaited<ReturnType<typeof school.createSchoolStudent>>;
let studentB: Awaited<ReturnType<typeof school.createSchoolStudent>>;
let yearA: Awaited<ReturnType<typeof school.createSchoolAcademicYear>>;
let buildingA: Awaited<ReturnType<typeof hostel.createHostelBuilding>>;
let buildingB: Awaited<ReturnType<typeof hostel.createHostelBuilding>>;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-hostel");
  orgB = await createTestOrg("orgB-hostel");
  campusA = await school.createSchoolCampus(orgA.organizationId, { code: "A", name: "A Campus" });
  const campusB = await school.createSchoolCampus(orgB.organizationId, { code: "B", name: "B Campus" });
  studentA = await school.createSchoolStudent(orgA.organizationId, { campusId: campusA.id, firstName: "Student", lastName: "A" });
  studentB = await school.createSchoolStudent(orgB.organizationId, { campusId: campusB.id, firstName: "Student", lastName: "B" });
  yearA = await school.createSchoolAcademicYear(orgA.organizationId, { name: "2030 Hostel", startDate: new Date("2030-01-01"), endDate: new Date("2030-12-31") });
  buildingA = await hostel.createHostelBuilding(orgA.organizationId, { code: "A1", name: "Building A1" });
  buildingB = await hostel.createHostelBuilding(orgB.organizationId, { code: "B1", name: "Building B1" });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Hostel service — real tenant isolation and end-to-end guards", () => {
  it("lists only its own buildings", async () => {
    const list = await hostel.listHostelBuildings(orgA.organizationId);
    expect(list.map((b) => b.id)).toContain(buildingA.id);
    expect(list.map((b) => b.id)).not.toContain(buildingB.id);
  });

  it("rejects creating a room under another tenant's building", async () => {
    await expect(
      hostel.createHostelRoom(orgA.organizationId, { buildingId: buildingB.id, roomNumber: "101", capacity: 2 }),
    ).rejects.toThrow(hostel.HostelNotFoundError);
  });

  it("rejects allocating a bed belonging to another tenant", async () => {
    const roomB = await hostel.createHostelRoom(orgB.organizationId, { buildingId: buildingB.id, roomNumber: "B101", capacity: 1 });
    const roomsB = await hostel.listHostelRooms(orgB.organizationId);
    const bedB = roomsB.find((r) => r.id === roomB.id)!.beds[0];

    await expect(
      hostel.createHostelAllocation(orgA.organizationId, { studentId: studentA.id, bedId: bedB.id, academicYearId: yearA.id, checkInDate: new Date("2030-09-01") }),
    ).rejects.toThrow(hostel.HostelNotFoundError);
  });

  it("rejects allocating a foreign tenant's student", async () => {
    const room = await hostel.createHostelRoom(orgA.organizationId, { buildingId: buildingA.id, roomNumber: "201", capacity: 1 });
    const rooms = await hostel.listHostelRooms(orgA.organizationId);
    const bed = rooms.find((r) => r.id === room.id)!.beds[0];

    await expect(
      hostel.createHostelAllocation(orgA.organizationId, { studentId: studentB.id, bedId: bed.id, academicYearId: yearA.id, checkInDate: new Date("2030-09-01") }),
    ).rejects.toThrow(hostel.HostelNotFoundError);
  });

  it("runs a full allocate -> bill -> pay -> checkout flow against real Postgres, freeing the bed at the end", async () => {
    const room = await hostel.createHostelRoom(orgA.organizationId, { buildingId: buildingA.id, roomNumber: "301", capacity: 1 });
    const rooms = await hostel.listHostelRooms(orgA.organizationId);
    const bed = rooms.find((r) => r.id === room.id)!.beds[0];
    expect(bed.status).toBe("AVAILABLE");

    const allocation = await hostel.createHostelAllocation(orgA.organizationId, {
      studentId: studentA.id, bedId: bed.id, academicYearId: yearA.id, checkInDate: new Date("2030-09-01"),
    });
    expect(allocation.status).toBe("ACTIVE");

    const occupiedBed = await testDb.hostelBed.findUniqueOrThrow({ where: { id: bed.id } });
    expect(occupiedBed.status).toBe("OCCUPIED");

    // A second allocation attempt for the same student must fail - one active allocation at a time.
    const room2 = await hostel.createHostelRoom(orgA.organizationId, { buildingId: buildingA.id, roomNumber: "302", capacity: 1 });
    const rooms2 = await hostel.listHostelRooms(orgA.organizationId);
    const bed2 = rooms2.find((r) => r.id === room2.id)!.beds[0];
    await expect(
      hostel.createHostelAllocation(orgA.organizationId, { studentId: studentA.id, bedId: bed2.id, academicYearId: yearA.id, checkInDate: new Date("2030-09-02") }),
    ).rejects.toThrow(hostel.HostelStateError);

    const invoice = await hostel.createHostelFeeInvoice(orgA.organizationId, {
      academicYearId: yearA.id, studentId: studentA.id, allocationId: allocation.id, description: "Term 1 hostel fee", amount: "200",
    });
    await expect(hostel.recordHostelFeePayment(orgA.organizationId, invoice.id, { amount: "201", method: "CASH" })).rejects.toThrow(hostel.HostelStateError);
    const payment = await hostel.recordHostelFeePayment(orgA.organizationId, invoice.id, { amount: "200", method: "CASH" });
    expect(payment.receiptNumber).toMatch(/^HRCT-/);

    const paidInvoice = await testDb.hostelFeeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paidInvoice.status).toBe("PAID");

    await hostel.endHostelAllocation(orgA.organizationId, allocation.id, new Date("2030-12-15"));
    const freedBed = await testDb.hostelBed.findUniqueOrThrow({ where: { id: bed.id } });
    expect(freedBed.status).toBe("AVAILABLE");

    await expect(hostel.endHostelAllocation(orgA.organizationId, allocation.id, new Date("2030-12-16"))).rejects.toThrow(hostel.HostelStateError);
  });
});
