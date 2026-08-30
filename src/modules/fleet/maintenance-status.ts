/**
 * Shared presentation for FleetMaintenanceProgressStatus - one source of
 * truth across the manager, driver, and mechanic surfaces (three copies of
 * the same mapping was already a real duplication risk after the mechanic
 * portal shipped; this expansion to 11 states made keeping them in sync by
 * hand too easy to get wrong).
 */
export const MAINTENANCE_PROGRESS_LABELS: Record<string, string> = {
  REPORTED: "Reported",
  REVIEWING: "Reviewing",
  AWAITING_OWNER_APPROVAL: "Awaiting owner approval",
  APPROVED: "Approved",
  ASSIGNED: "Mechanic assigned",
  SCHEDULED: "Repair scheduled",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  CANCELLED: "Withdrawn",
};

export const MAINTENANCE_PROGRESS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  REPORTED: "outline",
  REVIEWING: "secondary",
  AWAITING_OWNER_APPROVAL: "secondary",
  APPROVED: "secondary",
  ASSIGNED: "secondary",
  SCHEDULED: "secondary",
  IN_PROGRESS: "secondary",
  ON_HOLD: "outline",
  COMPLETED: "default",
  VERIFIED: "default",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};
