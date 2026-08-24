import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  organizationMember: { findFirst: vi.fn() },
  crmContact: { findFirst: vi.fn(), create: vi.fn() },
  crmLead: { findFirst: vi.fn(), create: vi.fn() },
  crmDeal: { findFirst: vi.fn(), create: vi.fn() },
  crmActivity: { create: vi.fn() },

  hrEmployee: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
  hrLeaveType: { findFirst: vi.fn() },
  hrLeaveRequest: { create: vi.fn() },
  hrPerformanceReview: { create: vi.fn() },
  hrPlanTemplate: { findFirst: vi.fn() },
  hrPlanInstance: { create: vi.fn() },

  fleetOwner: { findFirst: vi.fn() },
  fleetDriver: { findFirst: vi.fn() },
  fleetVehicle: { findFirst: vi.fn(), create: vi.fn() },
  fleetVehicleDocument: { create: vi.fn() },
  fleetMaintenanceRequest: { create: vi.fn() },
  fleetWorkAndPayContract: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  fleetPayment: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const crm = await import("@/modules/crm/service");
const hr = await import("@/modules/hr/service");
const fleet = await import("@/modules/fleet/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback) => callback(mockDb));
});

describe("CRM service — cross-tenant IDOR fixes", () => {
  it("createContact rejects an ownerId from another organization", async () => {
    mockDb.organizationMember.findFirst.mockResolvedValue(null);
    await expect(crm.createContact(ORG, { fullName: "Jane", ownerId: "user-foreign" })).rejects.toThrow(
      crm.NotFoundError,
    );
    expect(mockDb.crmContact.create).not.toHaveBeenCalled();
  });

  it("createDeal rejects a contactId from another organization", async () => {
    mockDb.crmContact.findFirst.mockResolvedValue(null);
    await expect(crm.createDeal(ORG, { title: "Big deal", value: "100.00", contactId: "contact-foreign" })).rejects.toThrow(
      crm.NotFoundError,
    );
    expect(mockDb.crmDeal.create).not.toHaveBeenCalled();
  });

  it("createActivity rejects a dealId from another organization", async () => {
    mockDb.crmDeal.findFirst.mockResolvedValue(null);
    await expect(
      crm.createActivity(ORG, { type: "CALL", subject: "Follow up", occurredAt: new Date(), dealId: "deal-foreign" }),
    ).rejects.toThrow(crm.NotFoundError);
    expect(mockDb.crmActivity.create).not.toHaveBeenCalled();
  });

  it("createContact succeeds when ownerId belongs to the organization", async () => {
    mockDb.organizationMember.findFirst.mockResolvedValue({ id: "mem-1" });
    mockDb.crmContact.create.mockResolvedValue({ id: "contact-1" });
    await crm.createContact(ORG, { fullName: "Jane", ownerId: "user-1" });
    expect(mockDb.crmContact.create).toHaveBeenCalled();
  });
});

describe("HR service — cross-tenant IDOR fixes", () => {
  it("createEmployee rejects a managerId from another organization", async () => {
    mockDb.hrEmployee.findFirst.mockResolvedValue(null);
    await expect(
      hr.createEmployee(ORG, { fullName: "New Hire", hireDate: new Date(), managerId: "emp-foreign" }),
    ).rejects.toThrow(hr.NotFoundError);
    expect(mockDb.hrEmployee.create).not.toHaveBeenCalled();
  });

  it("createLeaveRequest rejects an employeeId from another organization", async () => {
    mockDb.hrEmployee.findFirst.mockResolvedValue(null);
    await expect(
      hr.createLeaveRequest(ORG, {
        employeeId: "emp-foreign",
        leaveTypeId: "type-1",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-02"),
      }),
    ).rejects.toThrow(hr.NotFoundError);
    expect(mockDb.hrLeaveRequest.create).not.toHaveBeenCalled();
  });

  it("createLeaveRequest rejects a leaveTypeId from another organization", async () => {
    mockDb.hrEmployee.findFirst.mockResolvedValue({ id: "emp-1" });
    mockDb.hrLeaveType.findFirst.mockResolvedValue(null);
    await expect(
      hr.createLeaveRequest(ORG, {
        employeeId: "emp-1",
        leaveTypeId: "type-foreign",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-02"),
      }),
    ).rejects.toThrow(hr.NotFoundError);
  });

  it("createReview rejects an employeeId from another organization", async () => {
    mockDb.hrEmployee.findFirst.mockResolvedValue(null);
    await expect(
      hr.createReview(ORG, { employeeId: "emp-foreign", reviewPeriodStart: new Date(), reviewPeriodEnd: new Date() }),
    ).rejects.toThrow(hr.NotFoundError);
    expect(mockDb.hrPerformanceReview.create).not.toHaveBeenCalled();
  });

  it("launchPlan rejects an employeeId from another organization", async () => {
    mockDb.hrEmployee.findFirst.mockResolvedValue(null);
    mockDb.hrPlanTemplate.findFirst.mockResolvedValue({ id: "tpl-1", activities: [] });
    await expect(
      hr.launchPlan(ORG, { employeeId: "emp-foreign", kind: "ONBOARDING", templateId: "tpl-1", targetDate: new Date(), launchedById: "user-1" }),
    ).rejects.toThrow(hr.NotFoundError);
    expect(mockDb.hrPlanInstance.create).not.toHaveBeenCalled();
  });

  it("launchPlan rejects a templateId from another organization", async () => {
    mockDb.hrEmployee.findFirst.mockResolvedValue({ id: "emp-1", userId: null, manager: null });
    mockDb.hrPlanTemplate.findFirst.mockResolvedValue(null);
    await expect(
      hr.launchPlan(ORG, { employeeId: "emp-1", kind: "ONBOARDING", templateId: "tpl-foreign", targetDate: new Date(), launchedById: "user-1" }),
    ).rejects.toThrow(hr.NotFoundError);
    expect(mockDb.hrPlanInstance.create).not.toHaveBeenCalled();
  });
});

describe("Fleet service — cross-tenant IDOR fixes and payment atomicity", () => {
  it("createFleetVehicle rejects an ownerId from another organization", async () => {
    mockDb.fleetOwner.findFirst.mockResolvedValue(null);
    await expect(
      fleet.createFleetVehicle(ORG, { assetTag: "AT-1", plateNumber: "PL-1", ownerId: "owner-foreign" }),
    ).rejects.toThrow(fleet.NotFoundError);
    expect(mockDb.fleetVehicle.create).not.toHaveBeenCalled();
  });

  it("createFleetVehicle rejects an assignedDriverId from another organization", async () => {
    mockDb.fleetDriver.findFirst.mockResolvedValue(null);
    await expect(
      fleet.createFleetVehicle(ORG, { assetTag: "AT-1", plateNumber: "PL-1", assignedDriverId: "driver-foreign" }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("createFleetVehicleDocument rejects a vehicleId from another organization", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue(null);
    await expect(
      fleet.createFleetVehicleDocument(ORG, {
        vehicleId: "vehicle-foreign",
        provider: "Acme Insurance",
        policyNumber: "P-1",
        insuranceExpiresAt: new Date(),
        roadworthyExpiresAt: new Date(),
      }),
    ).rejects.toThrow(fleet.NotFoundError);
    expect(mockDb.fleetVehicleDocument.create).not.toHaveBeenCalled();
  });

  it("createFleetWorkAndPayContract rejects a vehicleId from another organization", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue(null);
    await expect(
      fleet.createFleetWorkAndPayContract(ORG, {
        contractName: "Contract 1",
        vehicleId: "vehicle-foreign",
        contractAmount: "1000.00",
        depositAmount: "100.00",
        paymentSchedule: "WEEKLY",
        scheduledPaymentAmount: "50.00",
      }),
    ).rejects.toThrow(fleet.NotFoundError);
    expect(mockDb.fleetWorkAndPayContract.create).not.toHaveBeenCalled();
  });

  it("createFleetWorkAndPayContract requires an active assigned driver", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue({ id: "vehicle-1", branchId: null, assignedDriver: null });
    await expect(
      fleet.createFleetWorkAndPayContract(ORG, {
        contractName: "Contract 1",
        vehicleId: "vehicle-1",
        contractAmount: "1000.00",
        depositAmount: "100.00",
        paymentSchedule: "WEEKLY",
        scheduledPaymentAmount: "50.00",
      }),
    ).rejects.toThrow(fleet.FleetDriverAssignmentError);
    expect(mockDb.fleetWorkAndPayContract.create).not.toHaveBeenCalled();
  });

  it("recordFleetWorkAndPayPayment rejects a non-positive amount before touching the database", async () => {
    await expect(fleet.recordFleetWorkAndPayPayment(ORG, "contract-1", {
      amount: -50,
      paymentDate: new Date(),
      paymentMethod: "CASH",
    })).rejects.toThrow(
      fleet.InvalidPaymentAmountError,
    );
    expect(mockDb.fleetWorkAndPayContract.findFirst).not.toHaveBeenCalled();
  });

  it("recordFleetWorkAndPayPayment uses an atomic increment/decrement, not a JS-computed absolute write", async () => {
    mockDb.fleetWorkAndPayContract.findFirst.mockResolvedValue({ id: "contract-1", contractStatus: "ACTIVE" });
    mockDb.fleetWorkAndPayContract.update
      .mockResolvedValueOnce({
        id: "contract-1",
        amountPaid: "150.00",
        outstandingBalance: "-50.00", // overpaid: contractAmount(100) - amountPaid(150)
        contractAmount: "100.00",
        contractStatus: "ACTIVE",
      })
      .mockResolvedValueOnce({ id: "contract-1", outstandingBalance: "0.00" });
    mockDb.fleetPayment.create.mockResolvedValue({ id: "payment-1" });

    await fleet.recordFleetWorkAndPayPayment(ORG, "contract-1", {
      amount: 50,
      paymentDate: new Date("2026-08-21T00:00:00.000Z"),
      paymentMethod: "CASH",
    });

    expect(mockDb.fleetWorkAndPayContract.update).toHaveBeenNthCalledWith(1, {
      where: { id: "contract-1", organizationId: ORG },
      data: { amountPaid: { increment: 50 }, outstandingBalance: { decrement: 50 } },
    });
    // Second call clamps the (possibly negative from overpayment) balance to zero and flips status.
    expect(mockDb.fleetWorkAndPayContract.update).toHaveBeenNthCalledWith(2, {
      where: { id: "contract-1", organizationId: ORG },
      data: { outstandingBalance: "0.00", completionPercentage: "100.00", contractStatus: "COMPLETED" },
    });
    expect(mockDb.fleetPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORG,
        type: "WORK_AND_PAY",
        amount: "50.00",
        status: "VERIFIED",
        verified: true,
        relatedEntity: "FleetWorkAndPayContract",
        relatedEntityId: "contract-1",
      }),
    });
  });
});
