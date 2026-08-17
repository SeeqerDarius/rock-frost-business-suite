import "server-only";

import type { TenantContext } from "@/lib/tenant";
import type { OfflineMutationInput } from "@/lib/offline-sync/contract";
import { resolveHandler, registerModuleAdapters } from "@/lib/offline-sync/registry";
import { OfflineMutationDeniedError, OfflineMutationConflictError } from "@/lib/offline-sync/errors";
import { fleetOfflineAdapters } from "@/lib/offline-sync/modules/fleet.adapters";
import { installmentOfflineAdapters } from "@/lib/offline-sync/modules/installment.adapters";
import { inventoryOfflineAdapters } from "@/lib/offline-sync/modules/inventory.adapters";
import { posOfflineAdapters } from "@/lib/offline-sync/modules/pos.adapters";
import { schoolOfflineAdapters } from "@/lib/offline-sync/modules/school.adapters";

export { OfflineMutationDeniedError, OfflineMutationConflictError } from "@/lib/offline-sync/errors";

registerModuleAdapters(fleetOfflineAdapters);
registerModuleAdapters(installmentOfflineAdapters);
registerModuleAdapters(inventoryOfflineAdapters);
registerModuleAdapters(posOfflineAdapters);
registerModuleAdapters(schoolOfflineAdapters);

/**
 * Dispatches to the handler registered for (entityType, operation) in
 * registry.ts. Each module registers its own handlers on import above; new
 * modules add a file under offline-sync/modules/ and one line here, rather
 * than growing this function.
 */
export async function applyOfflineMutation(tenant: TenantContext, mutation: OfflineMutationInput) {
  const handler = resolveHandler(mutation.entityType, mutation.operation);
  if (!handler) throw new OfflineMutationConflictError("This offline operation is not supported.", "UNSUPPORTED_OPERATION");
  try {
    if (!(await handler.checkPermission(tenant))) throw new OfflineMutationDeniedError("Permission is no longer available.");
    const parsed = handler.payloadSchema.safeParse(mutation.payload);
    if (!parsed.success) throw new OfflineMutationConflictError("The offline record is invalid or no longer supported.", "INVALID_PAYLOAD");
    if (handler.operation === "UPDATE") {
      if (!handler.loadCurrentVersion) throw new Error(`UPDATE handler for ${mutation.entityType} is missing loadCurrentVersion`);
      const currentVersion = await handler.loadCurrentVersion(tenant, mutation.entityId);
      if (currentVersion === null) throw new OfflineMutationConflictError("The record no longer exists.", "ENTITY_DELETED");
      if (currentVersion !== mutation.baseVersion) throw new OfflineMutationConflictError("The cloud record changed before synchronization.", "STALE_VERSION");
    }
    return await handler.apply(tenant, mutation.entityId, parsed.data);
  } catch (error) {
    if (error instanceof OfflineMutationDeniedError || error instanceof OfflineMutationConflictError) throw error;
    const message = error instanceof Error ? error.message : "The cloud record changed before synchronization.";
    throw new OfflineMutationConflictError(message, "SERVER_STATE_CHANGED");
  }
}
