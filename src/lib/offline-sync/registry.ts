import "server-only";

import type { z } from "zod";
import type { TenantContext } from "@/lib/tenant";

/**
 * One handler per (entityType, operation) pair. Keeping permission checking
 * split into a coarse `checkPermission` (payload-independent, runs before
 * parsing) and a payload-dependent fine-grained check inside `apply` mirrors
 * the exact order the original hand-written if/else chain used, so
 * extracting a module here is behavior-preserving, not just structurally
 * equivalent.
 */
export interface OfflineAdapterHandler<TPayload> {
  entityType: string;
  operation: "CREATE" | "UPDATE";
  payloadSchema: z.ZodType<TPayload>;
  checkPermission: (tenant: TenantContext) => boolean | Promise<boolean>;
  /** Required when operation is "UPDATE": the target row's current version (see the timestamp-as-version scheme), or null if it no longer exists. */
  loadCurrentVersion?: (tenant: TenantContext, entityId: string) => Promise<number | null>;
  /** Payload-dependent fine-grained checks plus the actual mutation, delegating to the same service-layer function the web UI calls. */
  apply: (tenant: TenantContext, entityId: string, payload: TPayload) => Promise<Record<string, unknown>>;
}

type AnyOfflineAdapterHandler = OfflineAdapterHandler<never>;

const handlers = new Map<string, AnyOfflineAdapterHandler>();

function registryKey(entityType: string, operation: string): string {
  return `${entityType}:${operation}`;
}

/** Type-erases a concrete-payload handler for storage; callers keep full payload typing inside their own module file. */
export function defineOfflineAdapter<TPayload>(handler: OfflineAdapterHandler<TPayload>): AnyOfflineAdapterHandler {
  return handler as unknown as AnyOfflineAdapterHandler;
}

export function registerModuleAdapters(moduleHandlers: readonly AnyOfflineAdapterHandler[]): void {
  for (const handler of moduleHandlers) {
    handlers.set(registryKey(handler.entityType, handler.operation), handler);
  }
}

export function resolveHandler(entityType: string, operation: string): AnyOfflineAdapterHandler | undefined {
  return handlers.get(registryKey(entityType, operation));
}
