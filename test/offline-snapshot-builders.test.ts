import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression tests for the snapshot decomposition (nested-blob-per-module
 * -> flat OfflineSnapshotRow[]). Covers row shape/scoping equivalence to
 * the original nested response for each of the 4 existing modules, plus
 * that buildOfflineSnapshot in service.ts composes the right builders for
 * the right authorizedModuleKeys.
 */

const mockDb = {
  fleetVehicle: { findMany: vi.fn() },
  fleetDriver: { findFirst: vi.fn() },
  fleetWorkAndPayContract: { findMany: vi.fn() },
  hirePurchaseAccount: { findMany: vi.fn() },
  inventoryItem: { findMany: vi.fn() },
  inventoryWarehouse: { findMany: vi.fn() },
  inventoryStock: { findMany: vi.fn() },
  posSession: { findMany: vi.fn() },
  posRegister: { findMany: vi.fn() },
  posSale: { findMany: vi.fn() },
  posSettings: { findUnique: vi.fn() },
  organizationModule: { findFirst: vi.fn() },
  schoolCampus: { findMany: vi.fn() },
  schoolAcademicYear: { findMany: vi.fn() },
  schoolTerm: { findMany: vi.fn() },
  schoolStudent: { findMany: vi.fn() },
  schoolGuardian: { findMany: vi.fn() },
  schoolStudentGuardian: { findMany: vi.fn() },
  schoolClass: { findMany: vi.fn() },
  schoolSubject: { findMany: vi.fn() },
  schoolEnrollment: { findMany: vi.fn() },
  schoolAttendance: { findMany: vi.fn() },
  schoolFeeInvoice: { findMany: vi.fn() },
  schoolFeeStructure: { findMany: vi.fn() },
  offlineDevice: { update: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/modules/installment/access", () => ({
  resolveInstallmentAccessScope: vi.fn(async () => ({ kind: "organization" as const })),
}));
vi.mock("@/modules/pos/service", () => ({ getSaleNumberPrefix: vi.fn(async () => "SALE") }));

const { buildFleetSnapshot } = await import("@/lib/offline-sync/snapshot-builders/fleet");
const { buildInstallmentSnapshot } = await import("@/lib/offline-sync/snapshot-builders/installment");
const { buildInventorySnapshot } = await import("@/lib/offline-sync/snapshot-builders/inventory");
const { buildPosSnapshot } = await import("@/lib/offline-sync/snapshot-builders/pos");
const { buildSchoolSnapshot } = await import("@/lib/offline-sync/snapshot-builders/school");
const { buildOfflineSnapshot } = await import("@/lib/offline-sync/service");

function fakeContext(overrides: Record<string, unknown> = {}) {
  return {
    device: { id: "device-1", organizationId: "org-1", userId: "user-1", offlineAccessUntil: new Date("2026-08-20T00:00:00.000Z") },
    tenant: { permissions: [], enabledModuleKeys: [] },
    authorizedModuleKeys: [],
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fleet snapshot builder", () => {
  it("decomposes vehicles, the driver profile, and contracts into rows with id/updatedAt promoted out of payload", async () => {
    mockDb.fleetVehicle.findMany.mockResolvedValue([
      { id: "v1", assetTag: "AT-1", plateNumber: "GR-1", make: "Toyota", model: "Hiace", status: "ACTIVE", assignedDriverId: "d1", updatedAt: new Date("2026-08-01T00:00:00.000Z") },
    ]);
    mockDb.fleetDriver.findFirst.mockResolvedValue({ id: "d1", updatedAt: new Date("2026-08-02T00:00:00.000Z"), assignedVehicles: [{ id: "v1" }] });
    mockDb.fleetWorkAndPayContract.findMany.mockResolvedValue([
      { id: "c1", vehicleId: "v1", outstandingBalance: "100.00", weeklyPaymentAmount: "50.00", updatedAt: new Date("2026-08-03T00:00:00.000Z") },
    ]);

    const result = await buildFleetSnapshot(fakeContext());

    expect(result.truncated).toBe(false);
    expect(result.rows).toEqual([
      { entityType: "fleet.vehicle", entityId: "v1", version: Date.parse("2026-08-01T00:00:00.000Z"), payload: { assetTag: "AT-1", plateNumber: "GR-1", make: "Toyota", model: "Hiace", status: "ACTIVE", assignedDriverId: "d1" } },
      { entityType: "fleet.driver_profile", entityId: "d1", version: Date.parse("2026-08-02T00:00:00.000Z"), payload: { assignedVehicles: [{ id: "v1" }] } },
      { entityType: "fleet.work_and_pay_contract", entityId: "c1", version: Date.parse("2026-08-03T00:00:00.000Z"), payload: { vehicleId: "v1", outstandingBalance: "100.00", weeklyPaymentAmount: "50.00" } },
    ]);
  });

  it("omits the driver_profile row when the requesting user has no active driver record", async () => {
    mockDb.fleetVehicle.findMany.mockResolvedValue([]);
    mockDb.fleetDriver.findFirst.mockResolvedValue(null);
    mockDb.fleetWorkAndPayContract.findMany.mockResolvedValue([]);

    const result = await buildFleetSnapshot(fakeContext());
    expect(result.rows).toEqual([]);
  });

  it("flags truncated only from the vehicle collection exceeding the row cap, matching the original nested-blob behavior", async () => {
    const oversized = Array.from({ length: 501 }, (_, i) => ({
      id: `v${i}`, assetTag: "AT", plateNumber: "P", make: "M", model: "M", status: "ACTIVE", assignedDriverId: null, updatedAt: new Date(),
    }));
    mockDb.fleetVehicle.findMany.mockResolvedValue(oversized);
    mockDb.fleetDriver.findFirst.mockResolvedValue(null);
    mockDb.fleetWorkAndPayContract.findMany.mockResolvedValue([]);

    const result = await buildFleetSnapshot(fakeContext());
    expect(result.truncated).toBe(true);
    expect(result.rows.filter((row) => row.entityType === "fleet.vehicle")).toHaveLength(500);
  });
});

describe("installment snapshot builder", () => {
  it("decomposes accounts into rows", async () => {
    mockDb.hirePurchaseAccount.findMany.mockResolvedValue([
      { id: "a1", customerId: "cust1", productId: "p1", balance: "200.00", totalPaid: "300.00", status: "ACTIVE", updatedAt: new Date("2026-08-04T00:00:00.000Z"), customer: { customerCode: "C-1", fullName: "Ama", phone: "0000" } },
    ]);

    const result = await buildInstallmentSnapshot(fakeContext());
    expect(result.rows).toEqual([
      { entityType: "installment.account", entityId: "a1", version: Date.parse("2026-08-04T00:00:00.000Z"), payload: { customerId: "cust1", productId: "p1", balance: "200.00", totalPaid: "300.00", status: "ACTIVE", customer: { customerCode: "C-1", fullName: "Ama", phone: "0000" } } },
    ]);
  });
});

describe("inventory snapshot builder", () => {
  it("gives inventory-manage users cost prices and org-wide warehouse scope, with warehouse/session rows versioned 0 since those models have no updatedAt", async () => {
    mockDb.inventoryItem.findMany.mockResolvedValue([
      { id: "i1", sku: "SKU-1", name: "Widget", unit: "pcs", costPrice: "10.00", updatedAt: new Date("2026-08-05T00:00:00.000Z") },
    ]);
    mockDb.inventoryWarehouse.findMany.mockResolvedValue([{ id: "w1", name: "Main", location: "Accra", active: true }]);
    mockDb.inventoryStock.findMany.mockResolvedValue([{ id: "s1", itemId: "i1", warehouseId: "w1", quantity: 5, updatedAt: new Date("2026-08-06T00:00:00.000Z") }]);

    const result = await buildInventorySnapshot(fakeContext(), ["inventory"]);

    const itemRow = result.rows.find((row) => row.entityType === "inventory.item");
    expect(itemRow?.payload).toMatchObject({ costPrice: "10.00" });
    const warehouseRow = result.rows.find((row) => row.entityType === "inventory.warehouse");
    expect(warehouseRow).toMatchObject({ entityId: "w1", version: 0 });
    const stockRow = result.rows.find((row) => row.entityType === "inventory.stock");
    expect(stockRow).toMatchObject({ entityId: "s1", version: Date.parse("2026-08-06T00:00:00.000Z") });
  });

  it("omits cost prices and restricts warehouse scope to the user's own open POS-session warehouses for POS-only users", async () => {
    mockDb.posSession.findMany.mockResolvedValue([{ register: { warehouseId: "w1" } }]);
    mockDb.inventoryItem.findMany.mockResolvedValue([{ id: "i1", sku: "SKU-1", name: "Widget", unit: "pcs", updatedAt: new Date() }]);
    mockDb.inventoryWarehouse.findMany.mockResolvedValue([{ id: "w1", name: "Main", location: "Accra", active: true }]);
    mockDb.inventoryStock.findMany.mockResolvedValue([]);

    const result = await buildInventorySnapshot(fakeContext(), ["pos"]);

    const itemRow = result.rows.find((row) => row.entityType === "inventory.item");
    expect(itemRow?.payload).not.toHaveProperty("costPrice");
    expect(mockDb.inventoryWarehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["w1"] } }) }),
    );
  });
});

describe("pos snapshot builder", () => {
  function stubEmptyPos() {
    mockDb.posRegister.findMany.mockResolvedValue([]);
    mockDb.posSession.findMany.mockResolvedValue([]);
    mockDb.posSale.findMany.mockResolvedValue([]);
    mockDb.posSettings.findUnique.mockResolvedValue(null);
    mockDb.organizationModule.findFirst.mockResolvedValue(null);
  }

  it("decomposes registers, sessions, and sales into rows, each versioned 0 except registers which have updatedAt", async () => {
    stubEmptyPos();
    mockDb.posRegister.findMany.mockResolvedValue([{ id: "r1", name: "Front", warehouseId: "w1", active: true, updatedAt: new Date("2026-08-07T00:00:00.000Z") }]);
    mockDb.posSession.findMany.mockResolvedValue([
      { id: "sess1", registerId: "r1", status: "OPEN", openedAt: new Date("2026-08-07T00:00:00.000Z"), openingFloat: "50.00", closingCash: null, closedAt: null, register: { name: "Front", warehouseId: "w1" } },
    ]);
    mockDb.posSale.findMany.mockResolvedValue([
      { id: "sale1", registerId: "r1", sessionId: "sess1", saleNumber: "SALE-00001", customerName: null, paymentMethod: "CASH", status: "COMPLETED", subtotal: "10.00", total: "10.00", createdAt: new Date("2026-08-07T01:00:00.000Z"), lines: [] },
    ]);

    const result = await buildPosSnapshot(fakeContext());
    expect(result.truncated).toBe(false);

    const registerRow = result.rows.find((row) => row.entityType === "pos.register");
    expect(registerRow).toMatchObject({ entityId: "r1", version: Date.parse("2026-08-07T00:00:00.000Z") });

    const sessionRow = result.rows.find((row) => row.entityType === "pos.session");
    expect(sessionRow).toMatchObject({ entityId: "sess1", version: 0 });

    const saleRow = result.rows.find((row) => row.entityType === "pos.sale_record");
    expect(saleRow).toMatchObject({ entityId: "sale1", version: 0, payload: { saleNumber: "SALE-00001" } });

    const settingsRow = result.rows.find((row) => row.entityType === "pos.settings");
    expect(settingsRow).toMatchObject({ entityId: "default", version: 0, payload: { saleNumberPrefix: "SALE", saleNumberPrefixVersion: 0 } });
  });

  it("gives every POS-authorized user org-wide session visibility when they hold POS_SESSIONS_MANAGE, and only their own sessions otherwise", async () => {
    stubEmptyPos();
    await buildPosSnapshot(fakeContext({ tenant: { permissions: ["pos.sessions.manage"], enabledModuleKeys: ["pos"] } }));
    expect(mockDb.posSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1" } }));

    mockDb.posSession.findMany.mockClear();
    await buildPosSnapshot(fakeContext({ tenant: { permissions: ["pos.sales.manage"], enabledModuleKeys: ["pos"] } }));
    expect(mockDb.posSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", openedById: "user-1" } }));
  });
});

describe("school snapshot builder", () => {
  function stubEmptySchool() {
    mockDb.schoolCampus.findMany.mockResolvedValue([]);
    mockDb.schoolAcademicYear.findMany.mockResolvedValue([]);
    mockDb.schoolTerm.findMany.mockResolvedValue([]);
    mockDb.schoolStudent.findMany.mockResolvedValue([]);
    mockDb.schoolGuardian.findMany.mockResolvedValue([]);
    mockDb.schoolStudentGuardian.findMany.mockResolvedValue([]);
    mockDb.schoolClass.findMany.mockResolvedValue([]);
    mockDb.schoolSubject.findMany.mockResolvedValue([]);
    mockDb.schoolEnrollment.findMany.mockResolvedValue([]);
    mockDb.schoolAttendance.findMany.mockResolvedValue([]);
    mockDb.schoolFeeInvoice.findMany.mockResolvedValue([]);
    mockDb.schoolFeeStructure.findMany.mockResolvedValue([]);
  }

  it("decomposes campuses, academic years, and terms into rows, versioned by updatedAt where it exists and 0 otherwise", async () => {
    stubEmptySchool();
    mockDb.schoolCampus.findMany.mockResolvedValue([
      { id: "c1", code: "MAIN", name: "Main Campus", address: null, phone: null, email: null, active: true, updatedAt: new Date("2026-08-01T00:00:00.000Z") },
    ]);
    mockDb.schoolAcademicYear.findMany.mockResolvedValue([
      { id: "y1", name: "2026/2027", startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2027-07-31T00:00:00.000Z"), current: true, closedAt: null },
    ]);
    mockDb.schoolTerm.findMany.mockResolvedValue([
      { id: "t1", academicYearId: "y1", name: "Term 1", startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-12-15T00:00:00.000Z"), current: true, closedAt: null },
    ]);

    const result = await buildSchoolSnapshot(fakeContext());
    expect(result.truncated).toBe(false);
    expect(result.rows).toEqual([
      { entityType: "school.campus", entityId: "c1", version: Date.parse("2026-08-01T00:00:00.000Z"), payload: { code: "MAIN", name: "Main Campus", address: null, phone: null, email: null, active: true } },
      { entityType: "school.academic_year", entityId: "y1", version: 0, payload: { name: "2026/2027", startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2027-07-31T00:00:00.000Z"), current: true, closedAt: null } },
      { entityType: "school.term", entityId: "t1", version: 0, payload: { academicYearId: "y1", name: "Term 1", startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-12-15T00:00:00.000Z"), current: true, closedAt: null } },
    ]);
  });

  it("only pulls active campuses, classes, and subjects, and only active enrollments", async () => {
    stubEmptySchool();
    await buildSchoolSnapshot(fakeContext());
    expect(mockDb.schoolCampus.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", active: true } }));
    expect(mockDb.schoolClass.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", active: true } }));
    expect(mockDb.schoolSubject.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", active: true } }));
    expect(mockDb.schoolEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", status: "ACTIVE" } }));
  });

  it("decomposes students, guardians, guardian links, classes, subjects, enrollments, and attendance, each versioned by updatedAt where it exists and 0 otherwise", async () => {
    stubEmptySchool();
    mockDb.schoolStudent.findMany.mockResolvedValue([
      { id: "s1", campusId: "c1", admissionNumber: "STU-00001", firstName: "Ama", lastName: "Owusu", dateOfBirth: null, gender: null, status: "ACTIVE", admissionDate: null, medicalNotes: null, updatedAt: new Date("2026-08-01T00:00:00.000Z") },
    ]);
    mockDb.schoolGuardian.findMany.mockResolvedValue([
      { id: "g1", guardianNumber: "GRD-00001", firstName: "Kofi", lastName: "Owusu", email: null, phone: "0244000000", address: null, occupation: null, updatedAt: new Date("2026-08-02T00:00:00.000Z") },
    ]);
    mockDb.schoolStudentGuardian.findMany.mockResolvedValue([{ id: "sg1", studentId: "s1", guardianId: "g1", relationship: "Father", primary: true, authorizedPickup: true }]);
    mockDb.schoolClass.findMany.mockResolvedValue([{ id: "cl1", campusId: "c1", code: "P1", name: "Primary 1", gradeLevel: "P1", capacity: 30 }]);
    mockDb.schoolSubject.findMany.mockResolvedValue([{ id: "sub1", code: "MATH", name: "Mathematics", description: null }]);
    mockDb.schoolEnrollment.findMany.mockResolvedValue([{ id: "e1", campusId: "c1", academicYearId: "y1", studentId: "s1", classId: "cl1", status: "ACTIVE", enrolledAt: new Date("2026-08-03T00:00:00.000Z"), endedAt: null }]);
    mockDb.schoolAttendance.findMany.mockResolvedValue([
      { id: "a1", termId: "t1", classId: "cl1", studentId: "s1", date: new Date("2026-08-15T00:00:00.000Z"), status: "PRESENT", reason: null, updatedAt: new Date("2026-08-15T00:00:00.000Z") },
    ]);

    const result = await buildSchoolSnapshot(fakeContext());
    expect(result.truncated).toBe(false);

    expect(result.rows.find((r) => r.entityType === "school.student")).toMatchObject({ entityId: "s1", version: Date.parse("2026-08-01T00:00:00.000Z"), payload: { admissionNumber: "STU-00001" } });
    expect(result.rows.find((r) => r.entityType === "school.guardian")).toMatchObject({ entityId: "g1", version: Date.parse("2026-08-02T00:00:00.000Z") });
    expect(result.rows.find((r) => r.entityType === "school.guardian_link")).toMatchObject({ entityId: "sg1", version: 0, payload: { studentId: "s1", guardianId: "g1", primary: true } });
    expect(result.rows.find((r) => r.entityType === "school.class")).toMatchObject({ entityId: "cl1", version: 0, payload: { name: "Primary 1" } });
    expect(result.rows.find((r) => r.entityType === "school.subject")).toMatchObject({ entityId: "sub1", version: 0, payload: { name: "Mathematics" } });
    expect(result.rows.find((r) => r.entityType === "school.enrollment")).toMatchObject({ entityId: "e1", version: 0, payload: { studentId: "s1", classId: "cl1" } });
    expect(result.rows.find((r) => r.entityType === "school.attendance")).toMatchObject({ entityId: "a1", version: Date.parse("2026-08-15T00:00:00.000Z"), payload: { status: "PRESENT" } });
  });

  it("decomposes fee invoices (with embedded payments, named fee_invoice_record) and active fee structures", async () => {
    stubEmptySchool();
    mockDb.schoolFeeInvoice.findMany.mockResolvedValue([
      {
        id: "inv1", academicYearId: "y1", termId: "t1", studentId: "s1", feeStructureId: null, invoiceNumber: "INV-00001",
        description: "Term 1 fees", amount: "500.00", discount: "0", status: "PART_PAID", dueDate: null, issuedAt: new Date("2026-08-01T00:00:00.000Z"), voidedAt: null,
        updatedAt: new Date("2026-08-05T00:00:00.000Z"),
        payments: [{ id: "pay1", amount: "200.00", method: "CASH", reference: null, receivedAt: new Date("2026-08-05T00:00:00.000Z"), refundedAt: null }],
      },
    ]);
    mockDb.schoolFeeStructure.findMany.mockResolvedValue([
      { id: "fs1", campusId: "c1", academicYearId: "y1", termId: "t1", classId: null, name: "Term 1 tuition", description: null, amount: "500.00", dueDate: null, active: true, updatedAt: new Date("2026-08-01T00:00:00.000Z") },
    ]);

    const result = await buildSchoolSnapshot(fakeContext());
    expect(result.truncated).toBe(false);

    const invoiceRow = result.rows.find((r) => r.entityType === "school.fee_invoice_record");
    expect(invoiceRow).toMatchObject({
      entityId: "inv1",
      version: Date.parse("2026-08-05T00:00:00.000Z"),
      payload: { invoiceNumber: "INV-00001", payments: [{ id: "pay1", amount: "200.00" }] },
    });
    expect(result.rows.find((r) => r.entityType === "school.fee_invoice")).toBeUndefined();

    const structureRow = result.rows.find((r) => r.entityType === "school.fee_structure");
    expect(structureRow).toMatchObject({ entityId: "fs1", version: Date.parse("2026-08-01T00:00:00.000Z"), payload: { name: "Term 1 tuition" } });
  });

  it("only pulls active fee structures", async () => {
    stubEmptySchool();
    await buildSchoolSnapshot(fakeContext());
    expect(mockDb.schoolFeeStructure.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", active: true } }));
  });
});

describe("buildOfflineSnapshot composition (service.ts)", () => {
  it("only builds sections for authorized modules and flattens their rows into one list", async () => {
    mockDb.fleetVehicle.findMany.mockResolvedValue([{ id: "v1", assetTag: "A", plateNumber: "P", make: "M", model: "M", status: "ACTIVE", assignedDriverId: null, updatedAt: new Date() }]);
    mockDb.fleetDriver.findFirst.mockResolvedValue(null);
    mockDb.fleetWorkAndPayContract.findMany.mockResolvedValue([]);

    const context = fakeContext({ authorizedModuleKeys: ["fleet"] });
    const response = await buildOfflineSnapshot(context);

    expect(mockDb.hirePurchaseAccount.findMany).not.toHaveBeenCalled();
    expect(mockDb.inventoryItem.findMany).not.toHaveBeenCalled();
    expect(response.rows).toHaveLength(1);
    expect(response.rows[0]).toMatchObject({ entityType: "fleet.vehicle", entityId: "v1" });
    expect(response.fullSnapshot).toBe(true);
    expect(mockDb.offlineDevice.update).toHaveBeenCalledWith({ where: { id: "device-1" }, data: { lastSyncAt: expect.any(Date) } });
  });

  it("builds the shared inventory section once when both inventory and pos are authorized", async () => {
    mockDb.inventoryItem.findMany.mockResolvedValue([]);
    mockDb.inventoryWarehouse.findMany.mockResolvedValue([]);
    mockDb.inventoryStock.findMany.mockResolvedValue([]);
    mockDb.posSession.findMany.mockResolvedValue([]);
    mockDb.posRegister.findMany.mockResolvedValue([]);
    mockDb.posSale.findMany.mockResolvedValue([]);
    mockDb.posSettings.findUnique.mockResolvedValue(null);
    mockDb.organizationModule.findFirst.mockResolvedValue(null);

    const context = fakeContext({ authorizedModuleKeys: ["inventory", "pos"] });
    await buildOfflineSnapshot(context);

    expect(mockDb.inventoryItem.findMany).toHaveBeenCalledTimes(1);
  });

  it("builds the school section only when school is authorized", async () => {
    mockDb.schoolCampus.findMany.mockResolvedValue([]);
    mockDb.schoolAcademicYear.findMany.mockResolvedValue([]);
    mockDb.schoolTerm.findMany.mockResolvedValue([]);
    mockDb.schoolStudent.findMany.mockResolvedValue([]);
    mockDb.schoolGuardian.findMany.mockResolvedValue([]);
    mockDb.schoolStudentGuardian.findMany.mockResolvedValue([]);
    mockDb.schoolClass.findMany.mockResolvedValue([]);
    mockDb.schoolSubject.findMany.mockResolvedValue([]);
    mockDb.schoolEnrollment.findMany.mockResolvedValue([]);
    mockDb.schoolAttendance.findMany.mockResolvedValue([]);
    mockDb.schoolFeeInvoice.findMany.mockResolvedValue([]);
    mockDb.schoolFeeStructure.findMany.mockResolvedValue([]);

    const context = fakeContext({ authorizedModuleKeys: ["school"] });
    await buildOfflineSnapshot(context);

    expect(mockDb.schoolCampus.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.fleetVehicle.findMany).not.toHaveBeenCalled();
  });

  it("aggregates truncated as true if any builder reports truncation", async () => {
    const oversizedAccounts = Array.from({ length: 501 }, (_, i) => ({
      id: `a${i}`, customerId: "c", productId: "p", balance: "0", totalPaid: "0", status: "ACTIVE", updatedAt: new Date(), customer: { customerCode: "C", fullName: "N", phone: "0" },
    }));
    mockDb.hirePurchaseAccount.findMany.mockResolvedValue(oversizedAccounts);

    const context = fakeContext({ authorizedModuleKeys: ["installment"] });
    const response = await buildOfflineSnapshot(context);
    expect(response.truncated).toBe(true);
  });
});
