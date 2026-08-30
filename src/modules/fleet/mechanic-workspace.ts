import "server-only";

import { db } from "@/lib/db";

// A request only ever carries a mechanicId once assignMaintenanceMechanic
// has moved it to ASSIGNED, so plain APPROVED never appears here.
const OPEN_STATUSES = ["ASSIGNED", "SCHEDULED", "IN_PROGRESS", "ON_HOLD"] as const;
const CLOSED_STATUSES = ["COMPLETED", "VERIFIED", "REJECTED", "CANCELLED"] as const;

/**
 * A mechanic's own workspace, scoped by construction to the FleetMechanic
 * row linked to their own userId - never every request assigned to every
 * mechanic. Mirrors the owner-workspace.ts file-split precedent: a mechanic's
 * scope is assignment-based rather than vehicle-based, so there is no
 * equivalent to owner-workspace's per-vehicle drill-down.
 */
export async function getFleetMechanicWorkspace(organizationId: string, userId: string) {
  const mechanic = await db.fleetMechanic.findFirst({ where: { organizationId, userId } });
  if (!mechanic) return null;

  const requests = await db.fleetMaintenanceRequest.findMany({
    where: { organizationId, mechanicId: mechanic.id },
    include: {
      vehicle: { include: { owner: true, assignedDriver: true } },
      attachments: { select: { id: true }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { requestedAt: "desc" },
  });

  const assigned = requests.filter((request) => (OPEN_STATUSES as readonly string[]).includes(request.progressStatus));
  const history = requests.filter((request) => (CLOSED_STATUSES as readonly string[]).includes(request.progressStatus));

  return { mechanic, assigned, history };
}
