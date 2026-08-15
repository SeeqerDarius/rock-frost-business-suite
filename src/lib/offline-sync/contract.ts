import { z } from "zod";

export const OFFLINE_SUPPORTED_MODULES = ["fleet", "installment", "inventory", "pos"] as const;
export type OfflineSupportedModule = (typeof OFFLINE_SUPPORTED_MODULES)[number];

export const OFFLINE_ENTITY_TYPES = [
  "fleet.maintenance_request",
  "fleet.driver_payment_submission",
  "installment.payment",
  "inventory.movement",
  "pos.sale",
] as const;

export const activationSchema = z.object({
  activationCode: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/),
  installationId: z.string().trim().min(12).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  name: z.string().trim().min(1).max(100),
  platform: z.enum(["windows", "macos", "linux"]),
  moduleKeys: z.array(z.enum(OFFLINE_SUPPORTED_MODULES)).min(1).max(4),
});

export const activationCodeRequestSchema = z.object({
  moduleKeys: z.array(z.enum(OFFLINE_SUPPORTED_MODULES)).min(1).max(4),
});

export const offlineMutationSchema = z.object({
  mutationId: z.string().uuid(),
  organizationId: z.string().min(1).max(64),
  moduleKey: z.enum(OFFLINE_SUPPORTED_MODULES),
  entityType: z.enum(OFFLINE_ENTITY_TYPES),
  entityId: z.string().min(1).max(128),
  operation: z.literal("CREATE"),
  baseVersion: z.literal(0),
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
