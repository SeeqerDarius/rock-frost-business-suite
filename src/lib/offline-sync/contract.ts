import { z } from "zod";

export const OFFLINE_SUPPORTED_MODULES = ["fleet", "installment", "inventory", "pos", "school"] as const;
export type OfflineSupportedModule = (typeof OFFLINE_SUPPORTED_MODULES)[number];

export const OFFLINE_ENTITY_TYPES = [
  "fleet.maintenance_request",
  "fleet.driver_payment_submission",
  "installment.payment",
  "inventory.movement",
  "pos.sale",
  "pos.register",
  "pos.session_open",
  "pos.session_close",
  "pos.sale_refund",
  "pos.settings_receipt_footer",
  "pos.settings_sale_prefix",
  // School foundational slice (milestone 6 of the offline expansion): the
  // reference data every other School entity type will hang off of once
  // later milestones add students, enrollment, fees, and exams.
  "school.campus",
  "school.academic_year",
  "school.term",
] as const;

export const activationSchema = z.object({
  activationCode: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/),
  installationId: z.string().trim().min(12).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  name: z.string().trim().min(1).max(100),
  platform: z.enum(["windows", "macos", "linux"]),
  moduleKeys: z.array(z.enum(OFFLINE_SUPPORTED_MODULES)).min(1).max(5),
});

export const activationCodeRequestSchema = z.object({
  moduleKeys: z.array(z.enum(OFFLINE_SUPPORTED_MODULES)).min(1).max(5),
});

export const offlineMutationSchema = z.object({
  mutationId: z.string().uuid(),
  organizationId: z.string().min(1).max(64),
  moduleKey: z.enum(OFFLINE_SUPPORTED_MODULES),
  entityType: z.enum(OFFLINE_ENTITY_TYPES),
  entityId: z.string().min(1).max(128),
  // UPDATE exists starting with pos.register (a real edit, not a
  // create-as-event); baseVersion carries the cached record's version at
  // edit time so the server can reject a stale write as a conflict rather
  // than silently overwrite - see registry.ts's loadCurrentVersion check.
  operation: z.enum(["CREATE", "UPDATE"]),
  baseVersion: z.number().int().min(0),
  changedAt: z.coerce.date(),
  payload: z.record(z.string(), z.unknown()),
});

export const pushBatchSchema = z.object({
  mutations: z.array(offlineMutationSchema).min(1).max(50),
});

export const conflictResolutionSchema = z.object({
  resolution: z.literal("KEEP_CLOUD"),
});

export type OfflineMutationInput = z.infer<typeof offlineMutationSchema>;

export const OFFLINE_SYNC_LIMITS = {
  maximumActiveDevicesPerUser: 5,
  maximumPayloadBytes: 64 * 1024,
  tokenLifetimeDays: 30,
  offlineAccessHours: 72,
  snapshotRowsPerCollection: 500,
} as const;
