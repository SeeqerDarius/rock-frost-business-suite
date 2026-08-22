import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fleet from "@/modules/fleet/service";
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
    const contract = await fleet.createFleetWorkAndPayContract(org.organizationId, {
      contractName: "Driver contract",
      vehicleId: assignedVehicleId,
      clientName: "Customer",
      contractAmount: "1000.00",
      depositAmount: "100.00",
      paymentSchedule: "DAILY",
      scheduledPaymentAmount: "100.00",
    });
    const submission = await fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      vehicleId: assignedVehicleId,
      contractId: contract.contract.id,
      submissionType: "WORK_AND_PAY",
      periodStart: new Date("2026-08-17T00:00:00.000Z"),
      amount: "100.00",
      paymentDate: new Date("2026-08-21T00:00:00.000Z"),
      paymentMethod: "BANK_TRANSFER",
      reference: "BANK-100",
    });
    expect(submission.periodEnd.toISOString()).toBe(submission.periodStart.toISOString());
    await fleet.reviewFleetDriverPaymentSubmission(org.organizationId, submission.id, org.userId, true);
    const updated = await testDb.fleetWorkAndPayContract.findUnique({ where: { id: contract.contract.id } });
    expect(updated?.amountPaid.toString()).toBe("200");
    expect(updated?.outstandingBalance.toString()).toBe("800");
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
