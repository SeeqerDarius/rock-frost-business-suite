import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fleet from "@/modules/fleet/service";
import { getFleetDriverObligations, getFleetDriverRosterSummary } from "@/modules/fleet/driver-obligations";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let org: TestOrg;
let driverUserId: string;
let ownerUserId: string;
let assignedVehicleId: string;
let otherVehicleId: string;

beforeAll(async () => {
  org = await createTestOrg("fleet-driver-sales");
  const [driverUser, ownerUser] = await Promise.all([
    testDb.user.create({ data: { name: "Assigned Driver", email: `driver-${org.organizationId}@example.invalid`, status: "ACTIVE" } }),
    testDb.user.create({ data: { name: "Vehicle Owner", email: `owner-${org.organizationId}@example.invalid`, status: "ACTIVE" } }),
  ]);
  driverUserId = driverUser.id;
  ownerUserId = ownerUser.id;
  const driver = await fleet.createFleetDriver(org.organizationId, { name: "Assigned Driver", userId: driverUserId });
  const owner = await fleet.createFleetOwner(org.organizationId, { name: "Vehicle Owner", userId: ownerUserId });
  const assigned = await fleet.createFleetVehicle(org.organizationId, {
    assetTag: "DRV-SALES-1",
    plateNumber: "DRV-1001",
    ownerId: owner.id,
    assignedDriverId: driver.id,
    status: "ASSIGNED",
    salesTargetPeriod: "DAILY",
    salesTargetAmount: "150.00",
  }, org.userId);
  assignedVehicleId = assigned.id;
  const other = await fleet.createFleetVehicle(org.organizationId, {
    assetTag: "DRV-SALES-2",
    plateNumber: "DRV-2002",
    salesTargetPeriod: "WEEKLY",
    salesTargetAmount: "700.00",
  });
  otherVehicleId = other.id;
});

afterAll(async () => {
  await cleanupTestOrg(org);
  await testDb.user.deleteMany({ where: { id: { in: [driverUserId, ownerUserId] } } });
});

describe("Fleet driver remittances and owner access (real Postgres)", () => {
  it("returns only vehicles assigned or owned by the current actor", async () => {
    const driverVehicles = await fleet.listFleetActorVehicles(org.organizationId, driverUserId, { driver: true, owner: false });
    expect(driverVehicles.map((vehicle) => vehicle.id)).toEqual([assignedVehicleId]);
    expect(driverVehicles.map((vehicle) => vehicle.id)).not.toContain(otherVehicleId);

    const ownerVehicles = await fleet.listFleetActorVehicles(org.organizationId, ownerUserId, { driver: false, owner: true });
    expect(ownerVehicles.map((vehicle) => vehicle.id)).toEqual([assignedVehicleId]);
  });

  it("accepts a recorded daily remittance and preserves the required amount and period", async () => {
    const periodStart = new Date("2026-08-20T00:00:00.000Z");
    const submission = await fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      vehicleId: assignedVehicleId,
      submissionType: "DAILY_SALES",
      periodStart,
      amount: "140.00",
      paymentDate: periodStart,
      paymentMethod: "MOBILE_MONEY",
      reference: "MOMO-140",
    });
    expect(submission.status).toBe("PENDING");
    expect(submission.expectedAmount?.toString()).toBe("150");
    expect(submission.periodStart.toISOString()).toBe(periodStart.toISOString());
    expect(submission.periodEnd.toISOString()).toBe(periodStart.toISOString());

    await expect(fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      vehicleId: assignedVehicleId,
      submissionType: "DAILY_SALES",
      periodStart,
      amount: "150.00",
      paymentDate: periodStart,
      paymentMethod: "CASH",
    })).rejects.toThrow(fleet.FleetDuplicateSubmissionError);

    const approved = await fleet.reviewFleetDriverPaymentSubmission(org.organizationId, submission.id, org.userId, true);
    expect(approved.status).toBe("APPROVED");
    const payment = await testDb.fleetPayment.findUnique({ where: { id: approved.fleetPaymentId! } });
    expect(payment?.type).toBe("WEEKLY_SALES");
    expect(payment?.relatedEntity).toBe("FleetVehicle");
    expect(payment?.relatedEntityId).toBe(assignedVehicleId);
  });

  it("rejects another vehicle and a remittance frequency not configured for the assignment", async () => {
    const input = {
      amount: "150.00",
      paymentDate: new Date("2026-08-21T00:00:00.000Z"),
      periodStart: new Date("2026-08-21T00:00:00.000Z"),
      paymentMethod: "CASH",
    };
    await expect(fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      ...input,
      vehicleId: otherVehicleId,
      submissionType: "WEEKLY_SALES",
    })).rejects.toThrow(fleet.NotFoundError);
    await expect(fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      ...input,
      vehicleId: assignedVehicleId,
      submissionType: "WEEKLY_SALES",
    })).rejects.toThrow(fleet.FleetSalesTargetError);
  });

  it("requires a transaction reference for non-cash remittances", async () => {
    await expect(fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      vehicleId: assignedVehicleId,
      submissionType: "DAILY_SALES",
      periodStart: new Date("2026-08-23T00:00:00.000Z"),
      amount: "150.00",
      paymentDate: new Date("2026-08-23T00:00:00.000Z"),
      paymentMethod: "MOBILE_MONEY",
    })).rejects.toThrow(fleet.FleetPaymentEvidenceError);
  });

  it("rejects future-dated completed payments and obligation periods", async () => {
    await expect(fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      vehicleId: assignedVehicleId,
      submissionType: "DAILY_SALES",
      periodStart: new Date("2099-01-01T00:00:00.000Z"),
      amount: "150.00",
      paymentDate: new Date("2099-01-01T00:00:00.000Z"),
      paymentMethod: "CASH",
    })).rejects.toThrow(fleet.FleetPaymentDateError);
  });

  it("normalizes weekly remittances to Monday so one week cannot be submitted twice", async () => {
    await testDb.fleetVehicle.update({ where: { id: assignedVehicleId }, data: { salesTargetPeriod: "WEEKLY", salesTargetAmount: "700.00" } });
    try {
      const first = await fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
        vehicleId: assignedVehicleId,
        submissionType: "WEEKLY_SALES",
        periodStart: new Date("2026-08-24T00:00:00.000Z"),
        amount: "700.00",
        paymentDate: new Date("2026-08-24T00:00:00.000Z"),
        paymentMethod: "CASH",
      });
      expect(first.periodStart.toISOString()).toBe("2026-08-24T00:00:00.000Z");
      expect(first.periodEnd.toISOString()).toBe("2026-08-30T00:00:00.000Z");
      await expect(fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
        vehicleId: assignedVehicleId,
        submissionType: "WEEKLY_SALES",
        periodStart: new Date("2026-08-27T00:00:00.000Z"),
        amount: "700.00",
        paymentDate: new Date("2026-08-27T00:00:00.000Z"),
        paymentMethod: "CASH",
      })).rejects.toThrow(fleet.FleetDuplicateSubmissionError);
    } finally {
      await testDb.fleetVehicle.update({ where: { id: assignedVehicleId }, data: { salesTargetPeriod: "DAILY", salesTargetAmount: "150.00" } });
    }
  });

  it("serializes duplicate submission and approval attempts", async () => {
    const periodStart = new Date("2026-08-22T00:00:00.000Z");
    const input = {
      vehicleId: assignedVehicleId,
      submissionType: "DAILY_SALES" as const,
      periodStart,
      amount: "150.00",
      paymentDate: periodStart,
      paymentMethod: "CASH",
    };
    const submissions = await Promise.allSettled([
      fleet.submitFleetDriverPayment(org.organizationId, driverUserId, input),
      fleet.submitFleetDriverPayment(org.organizationId, driverUserId, input),
    ]);
    expect(submissions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(submissions.filter((result) => result.status === "rejected")).toHaveLength(1);
    const submission = submissions.find((result) => result.status === "fulfilled")!.value;

    const reviews = await Promise.allSettled([
      fleet.reviewFleetDriverPaymentSubmission(org.organizationId, submission.id, org.userId, true),
      fleet.reviewFleetDriverPaymentSubmission(org.organizationId, submission.id, org.userId, true),
    ]);
    expect(reviews.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(reviews.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await testDb.fleetPayment.count({ where: { reference: `DRV-${submission.id.slice(-8).toUpperCase()}` } })).toBe(1);
  });

  it("supports a daily Work & Pay schedule and updates its balance only after approval", async () => {
    const { contract } = await fleet.createFleetWorkAndPayContract(org.organizationId, {
      contractName: "Driver contract",
      vehicleId: assignedVehicleId,
      contractAmount: "1000.00",
      depositAmount: "100.00",
      paymentSchedule: "DAILY",
      scheduledPaymentAmount: "100.00",
    });
    expect(contract.driverId).not.toBeNull();
    expect(contract.clientName).toBe("Assigned Driver");
    const submission = await fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      vehicleId: assignedVehicleId,
      contractId: contract.id,
      submissionType: "WORK_AND_PAY",
      periodStart: new Date("2026-08-17T00:00:00.000Z"),
      amount: "100.00",
      paymentDate: new Date("2026-08-21T00:00:00.000Z"),
      paymentMethod: "BANK_TRANSFER",
      reference: "BANK-100",
    });
    expect(submission.periodEnd.toISOString()).toBe(submission.periodStart.toISOString());
    await fleet.reviewFleetDriverPaymentSubmission(org.organizationId, submission.id, org.userId, true);
    const updated = await testDb.fleetWorkAndPayContract.findUnique({ where: { id: contract.id } });
    expect(updated?.amountPaid.toString()).toBe("200");
    expect(updated?.outstandingBalance.toString()).toBe("800");

    const replacementDriver = await fleet.createFleetDriver(org.organizationId, {
      name: "Replacement Driver",
      userId: ownerUserId,
    });
    await testDb.fleetVehicle.update({ where: { id: assignedVehicleId }, data: { assignedDriverId: replacementDriver.id } });
    try {
      await expect(fleet.submitFleetDriverPayment(org.organizationId, ownerUserId, {
        vehicleId: assignedVehicleId,
        contractId: contract.id,
        submissionType: "WORK_AND_PAY",
        periodStart: new Date("2026-08-18T00:00:00.000Z"),
        amount: "100.00",
        paymentDate: new Date("2026-08-22T00:00:00.000Z"),
        paymentMethod: "CASH",
      })).rejects.toThrow(fleet.NotFoundError);
    } finally {
      await testDb.fleetVehicle.update({ where: { id: assignedVehicleId }, data: { assignedDriverId: contract.driverId } });
    }
  });

  it("derives an obligation summary from real submission history that matches actual approved/pending amounts", async () => {
    const obligationDriverUser = await testDb.user.create({ data: { name: "Obligation Driver", email: `obligation-${org.organizationId}@example.invalid`, status: "ACTIVE" } });
    const obligationDriver = await fleet.createFleetDriver(org.organizationId, { name: "Obligation Driver", userId: obligationDriverUser.id });
    const obligationVehicle = await fleet.createFleetVehicle(org.organizationId, {
      assetTag: "DRV-OBLIGATION-1",
      plateNumber: "DRV-3003",
      assignedDriverId: obligationDriver.id,
      status: "ASSIGNED",
      salesTargetPeriod: "DAILY",
      salesTargetAmount: "150.00",
    }, org.userId);

    const now = new Date("2026-08-26T10:00:00.000Z");
    const paidPeriod = new Date("2026-08-25T00:00:00.000Z");
    const partialPeriod = new Date("2026-08-26T00:00:00.000Z");

    const paidSubmission = await fleet.submitFleetDriverPayment(org.organizationId, obligationDriverUser.id, {
      vehicleId: obligationVehicle.id,
      submissionType: "DAILY_SALES",
      periodStart: paidPeriod,
      amount: "150.00",
      paymentDate: paidPeriod,
      paymentMethod: "CASH",
    });
    await fleet.reviewFleetDriverPaymentSubmission(org.organizationId, paidSubmission.id, org.userId, true);

    await fleet.submitFleetDriverPayment(org.organizationId, obligationDriverUser.id, {
      vehicleId: obligationVehicle.id,
      submissionType: "DAILY_SALES",
      periodStart: partialPeriod,
      amount: "90.00",
      paymentDate: partialPeriod,
      paymentMethod: "CASH",
    });

    const driverWithVehicles = await fleet.getFleetDriverWorkspace(org.organizationId, obligationDriverUser.id);
    const obligations = await getFleetDriverObligations(org.organizationId, driverWithVehicles!.assignedVehicles, now);

    const vehicleObligation = obligations.vehicles.find((v) => v.vehicleId === obligationVehicle.id);
    expect(vehicleObligation?.summary?.pendingAmount).toBe(90);
    expect(vehicleObligation?.summary?.dueNow).toBe(150); // today's own period is still unsubmitted and open
    expect(obligations.totals.pendingAmount).toBe(90);

    const paidPeriodSummary = vehicleObligation?.summary?.periods.find((p) => p.periodStart.getTime() === paidPeriod.getTime());
    expect(paidPeriodSummary?.isPaid).toBe(true);
    expect(paidPeriodSummary?.isOverdue).toBe(false);

    await testDb.user.delete({ where: { id: obligationDriverUser.id } });
  });

  it("computes an accurate roster summary across drivers with different assignment, login, and payment states", async () => {
    const linkedUser = await testDb.user.create({ data: { name: "Linked Roster Driver", email: `roster-linked-${org.organizationId}@example.invalid`, status: "ACTIVE" } });
    const linkedDriver = await fleet.createFleetDriver(org.organizationId, { name: "Linked Roster Driver", userId: linkedUser.id });
    const unlinkedDriver = await fleet.createFleetDriver(org.organizationId, { name: "Unlinked Roster Driver" });
    const rosterVehicle = await fleet.createFleetVehicle(org.organizationId, {
      assetTag: "DRV-ROSTER-1",
      plateNumber: "DRV-4004",
      assignedDriverId: linkedDriver.id,
      status: "ASSIGNED",
      salesTargetPeriod: "DAILY",
      salesTargetAmount: "175.00",
    }, org.userId);

    const roster = await getFleetDriverRosterSummary(org.organizationId);
    const linkedEntry = roster.find((r) => r.driverId === linkedDriver.id);
    const unlinkedEntry = roster.find((r) => r.driverId === unlinkedDriver.id);

    expect(linkedEntry?.loginLinked).toBe(true);
    expect(linkedEntry?.loginEmail).toBe(linkedUser.email);
    expect(linkedEntry?.vehiclePlates).toEqual([rosterVehicle.plateNumber]);
    expect(linkedEntry?.paymentReadiness).toBe("due"); // today's remittance is unsubmitted but not yet overdue
    expect(linkedEntry?.pendingSubmissionCount).toBe(0);

    expect(unlinkedEntry?.loginLinked).toBe(false);
    expect(unlinkedEntry?.loginEmail).toBeNull();
    expect(unlinkedEntry?.paymentReadiness).toBe("no-obligation");

    await testDb.user.delete({ where: { id: linkedUser.id } });
  });

  it("never surfaces a predecessor driver's maintenance report to whoever the vehicle is reassigned to next", async () => {
    const [firstUser, secondUser] = await Promise.all([
      testDb.user.create({ data: { name: "First Reassignment Driver", email: `reassign-1-${org.organizationId}@example.invalid`, status: "ACTIVE" } }),
      testDb.user.create({ data: { name: "Second Reassignment Driver", email: `reassign-2-${org.organizationId}@example.invalid`, status: "ACTIVE" } }),
    ]);
    const [firstDriver, secondDriver] = await Promise.all([
      fleet.createFleetDriver(org.organizationId, { name: "First Reassignment Driver", userId: firstUser.id }),
      fleet.createFleetDriver(org.organizationId, { name: "Second Reassignment Driver", userId: secondUser.id }),
    ]);
    const vehicle = await fleet.createFleetVehicle(org.organizationId, {
      assetTag: "DRV-REASSIGN-1",
      plateNumber: "DRV-5005",
      assignedDriverId: firstDriver.id,
      status: "ASSIGNED",
      salesTargetPeriod: "DAILY",
      salesTargetAmount: "150.00",
    }, org.userId);

    const request = await fleet.createFleetMaintenanceRequest(org.organizationId, {
      vehicleId: vehicle.id,
      faultDescription: "Brake pads worn - first driver's private report",
      requestedById: firstUser.id,
    });

    // Reassign the same vehicle to a different driver, exactly like a Fleet
    // Manager would when a driver leaves or moves vehicles.
    await testDb.fleetVehicle.update({ where: { id: vehicle.id }, data: { assignedDriverId: secondDriver.id } });

    const secondWorkspace = await fleet.getFleetDriverWorkspace(org.organizationId, secondUser.id);
    const secondDriverVehicle = secondWorkspace?.assignedVehicles.find((v) => v.id === vehicle.id);
    expect(secondDriverVehicle).toBeDefined();
    expect(secondDriverVehicle?.maintenanceRequests).toEqual([]);

    const scopedRequests = await fleet.listFleetMaintenanceRequests(org.organizationId, [vehicle.id], secondUser.id);
    expect(scopedRequests).toEqual([]);

    const canSecondDriverViewAttachmentIfAny = await fleet.getFleetMaintenanceAttachment(org.organizationId, "nonexistent", secondUser.id, false);
    expect(canSecondDriverViewAttachmentIfAny).toBeNull();

    // The report is still there for anyone with real oversight - a manager
    // viewing unscoped, or the original requester by id - only "whoever
    // currently drives this vehicle" is excluded.
    const unscopedRequests = await fleet.listFleetMaintenanceRequests(org.organizationId, [vehicle.id]);
    expect(unscopedRequests.map((r) => r.id)).toContain(request.id);

    await testDb.user.deleteMany({ where: { id: { in: [firstUser.id, secondUser.id] } } });
  });

  it("seeds a least-privilege Vehicle Owner role and removes organization-wide Fleet view from Driver", async () => {
    const roles = await testDb.role.findMany({
      where: { organizationId: null, name: { in: ["Driver", "Vehicle Owner"] } },
      include: { rolePermissions: { include: { permission: true } } },
    });
    const driverRole = roles.find((role) => role.name === "Driver");
    const ownerRole = roles.find((role) => role.name === "Vehicle Owner");
    expect(driverRole?.rolePermissions.map((grant) => grant.permission.key)).toContain("fleet.driver.self_service");
    expect(driverRole?.rolePermissions.map((grant) => grant.permission.key)).not.toContain("fleet.view");
    expect(ownerRole?.rolePermissions.map((grant) => grant.permission.key)).toContain("fleet.investor.view");
    expect(ownerRole?.rolePermissions.map((grant) => grant.permission.key)).not.toContain("fleet.view");
  });
});
