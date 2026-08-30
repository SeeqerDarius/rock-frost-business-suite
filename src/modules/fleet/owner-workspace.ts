import "server-only";

import { db } from "@/lib/db";
import { buildTrendBuckets, widestTrendLookback, type TrendGranularity } from "@/lib/trend-buckets";
import { getFleetDriverObligations } from "@/modules/fleet/driver-obligations";

/**
 * Every FleetMaintenanceProgressStatus value that represents a request still
 * somewhere in the active pipeline - not yet a terminal state (COMPLETED,
 * VERIFIED, REJECTED, CANCELLED). AWAITING_OWNER_APPROVAL is the state a
 * request sits in while awaiting the owner's own approval decision, the
 * single most important thing for an owner to see on their own dashboard -
 * an earlier version of this array referenced three values that never
 * existed in the enum at all, silently excluding it from this count.
 */
const OPEN_MAINTENANCE = ["REPORTED", "AWAITING_OWNER_APPROVAL", "APPROVED", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "ON_HOLD"] as const;

export async function getFleetOwnerWorkspace(organizationId: string, userId: string, now = new Date()) {
  const owner = await db.fleetOwner.findFirst({
    where: { organizationId, userId },
    include: {
      vehicles: {
        include: {
          assignedDriver: { select: { id: true, name: true, status: true } },
          documents: { orderBy: { insuranceExpiresAt: "asc" } },
          maintenanceRequests: { include: { events: { orderBy: { createdAt: "asc" } } }, orderBy: { requestedAt: "desc" } },
          workAndPayContracts: { orderBy: { createdAt: "desc" } },
          ownershipHistory: { orderBy: { changedAt: "desc" } },
        },
        orderBy: { plateNumber: "asc" },
      },
    },
  });
  if (!owner) return null;

  const obligations = await getFleetDriverObligations(organizationId, owner.vehicles, now);
  const obligationByVehicle = new Map(obligations.vehicles.map((item) => [item.vehicleId, item.summary]));
  const vehicleIds = owner.vehicles.map((vehicle) => vehicle.id);
  const contractIds = owner.vehicles.flatMap((vehicle) => vehicle.workAndPayContracts.map((contract) => contract.id));
  const payments = vehicleIds.length === 0 && contractIds.length === 0 ? [] : await db.fleetPayment.findMany({
    where: {
      organizationId,
      status: "VERIFIED",
      verified: true,
      OR: [
        ...(vehicleIds.length ? [{ relatedEntity: "FleetVehicle", relatedEntityId: { in: vehicleIds } }] : []),
        ...(contractIds.length ? [{ relatedEntity: "FleetWorkAndPayContract", relatedEntityId: { in: contractIds } }] : []),
      ],
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const paymentForVehicle = (vehicleId: string, ownedContractIds: Set<string>) => payments.filter((payment) =>
    (payment.relatedEntity === "FleetVehicle" && payment.relatedEntityId === vehicleId) ||
    (payment.relatedEntity === "FleetWorkAndPayContract" && payment.relatedEntityId && ownedContractIds.has(payment.relatedEntityId)),
  );

  const vehicles = owner.vehicles.map((vehicle) => {
    const contractIdSet = new Set(vehicle.workAndPayContracts.map((contract) => contract.id));
    const vehiclePayments = paymentForVehicle(vehicle.id, contractIdSet);
    const verifiedCollections = vehiclePayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const verifiedExpenses = vehicle.maintenanceRequests
      .filter((request) => request.progressStatus === "VERIFIED" && request.repairCost)
      .reduce((sum, request) => sum + Number(request.repairCost), 0);
    const obligation = obligationByVehicle.get(vehicle.id) ?? null;
    const openMaintenance = vehicle.maintenanceRequests.filter((request) => OPEN_MAINTENANCE.includes(request.progressStatus as (typeof OPEN_MAINTENANCE)[number]));
    const ownerApprovals = openMaintenance.filter((request) => request.ownerApprovalRequired && request.ownerApprovalStatus === "PENDING");
    const documentAttention = vehicle.documents.filter((document) => document.renewalStatus !== "CLEAR");
    return {
      ...vehicle,
      payments: vehiclePayments,
      obligation,
      verifiedCollections,
      verifiedExpenses,
      operatingPosition: verifiedCollections - verifiedExpenses,
      openMaintenanceCount: openMaintenance.length,
      ownerApprovalCount: ownerApprovals.length,
      documentAttentionCount: documentAttention.length,
      attentionCount: ownerApprovals.length + documentAttention.length + (obligation?.overdueAmount ? 1 : 0) + (!vehicle.assignedDriver ? 1 : 0),
    };
  });

  const totalExpected = vehicles.reduce((sum, vehicle) => sum + (vehicle.obligation?.expectedAmount ?? 0), 0);
  const paidThisPeriod = vehicles.reduce((sum, vehicle) => sum + (vehicle.obligation?.paidThisPeriod ?? 0), 0);
  const overdueAmount = vehicles.reduce((sum, vehicle) => sum + (vehicle.obligation?.overdueAmount ?? 0), 0);
  const verifiedCollections = vehicles.reduce((sum, vehicle) => sum + vehicle.verifiedCollections, 0);
  const verifiedExpenses = vehicles.reduce((sum, vehicle) => sum + vehicle.verifiedExpenses, 0);

  const maintenanceForTrends = owner.vehicles.flatMap((vehicle) => vehicle.maintenanceRequests)
    .filter((request) => request.progressStatus === "VERIFIED" && request.completedAt && request.repairCost && request.completedAt >= widestTrendLookback());
  const collectionsForTrends = payments.filter((payment) => payment.date >= widestTrendLookback());
  const buildSeries = (granularity: TrendGranularity) => buildTrendBuckets(granularity).map((bucket) => {
    const collected = collectionsForTrends.filter((payment) => payment.date >= bucket.start && payment.date < bucket.end).reduce((sum, payment) => sum + Number(payment.amount), 0);
    const expenses = maintenanceForTrends.filter((request) => request.completedAt! >= bucket.start && request.completedAt! < bucket.end).reduce((sum, request) => sum + Number(request.repairCost), 0);
    return { label: bucket.label, collected, expenses, operatingPosition: collected - expenses };
  });

  return {
    owner: { id: owner.id, name: owner.name, businessName: owner.businessName, email: owner.email, phone: owner.phone },
    vehicles,
    totals: {
      vehicleCount: vehicles.length,
      activeCount: vehicles.filter((vehicle) => ["AVAILABLE", "ASSIGNED"].includes(vehicle.status)).length,
      maintenanceCount: vehicles.filter((vehicle) => vehicle.openMaintenanceCount > 0).length,
      expectedThisPeriod: totalExpected,
      paidThisPeriod,
      remainingThisPeriod: Math.max(totalExpected - paidThisPeriod, 0),
      overdueAmount,
      verifiedCollections,
      verifiedExpenses,
      operatingPosition: verifiedCollections - verifiedExpenses,
      attentionCount: vehicles.reduce((sum, vehicle) => sum + vehicle.attentionCount, 0),
    },
    trends: { days: buildSeries("days"), weeks: buildSeries("weeks"), months: buildSeries("months") },
    settlementConfigured: false as const,
  };
}

export async function getFleetOwnerVehicleWorkspace(organizationId: string, userId: string, vehicleId: string) {
  const workspace = await getFleetOwnerWorkspace(organizationId, userId);
  if (!workspace) return null;
  const vehicle = workspace.vehicles.find((candidate) => candidate.id === vehicleId);
  return vehicle ? { owner: workspace.owner, vehicle, settlementConfigured: workspace.settlementConfigured } : null;
}
