export const MODULE_REQUEST_TYPE_LABELS = {
  DEMO: "Request a module demo",
  ENABLE_EXISTING: "Enable an existing module",
  CUSTOMIZE_EXISTING: "Customize an existing module",
  CUSTOM_MODULE: "Build a custom module",
  INTEGRATION: "Integration request",
  DATA_MIGRATION: "Data migration",
} as const;

export const MODULE_REQUEST_STATUS_LABELS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  NEEDS_INFORMATION: "Needs information",
  QUOTED: "Quoted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IMPLEMENTING: "Implementing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;

export const MODULE_REQUEST_PRIORITY_LABELS = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
} as const;

export const MODULE_REQUEST_TYPES = Object.keys(MODULE_REQUEST_TYPE_LABELS) as Array<
  keyof typeof MODULE_REQUEST_TYPE_LABELS
>;
export const MODULE_REQUEST_STATUSES = Object.keys(MODULE_REQUEST_STATUS_LABELS) as Array<
  keyof typeof MODULE_REQUEST_STATUS_LABELS
>;
export const MODULE_REQUEST_PRIORITIES = Object.keys(MODULE_REQUEST_PRIORITY_LABELS) as Array<
  keyof typeof MODULE_REQUEST_PRIORITY_LABELS
>;

export const TERMINAL_MODULE_REQUEST_STATUSES = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);
