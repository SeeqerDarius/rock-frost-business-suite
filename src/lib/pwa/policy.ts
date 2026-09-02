import type { Prisma } from "@prisma/client";

export interface OfflinePolicy {
  enabled: boolean;
  mutationKillSwitch: boolean;
  moduleKeys: string[];
  leaseHours: number;
}

const DEFAULT_POLICY: OfflinePolicy = { enabled: false, mutationKillSwitch: true, moduleKeys: [], leaseHours: 12 };
export const OFFLINE_SUPPORTED_MODULES = ["pos", "fleet", "inventory", "accounting", "school", "hostel", "hotel", "pharmacy", "hospital"] as const;

export function resolveOfflinePolicy(metadata: Prisma.JsonValue | null | undefined): OfflinePolicy {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return DEFAULT_POLICY;
  const raw = (metadata as Record<string, unknown>).offlineAccess;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_POLICY;
  const value = raw as Record<string, unknown>;
  const leaseHours = typeof value.leaseHours === "number" && Number.isInteger(value.leaseHours)
    ? Math.min(24, Math.max(1, value.leaseHours))
    : DEFAULT_POLICY.leaseHours;
  return {
    enabled: value.enabled === true,
    mutationKillSwitch: value.mutationKillSwitch !== false,
    moduleKeys: Array.isArray(value.moduleKeys) ? value.moduleKeys.filter((key): key is string => typeof key === "string" && (OFFLINE_SUPPORTED_MODULES as readonly string[]).includes(key)) : [],
    leaseHours,
  };
}
