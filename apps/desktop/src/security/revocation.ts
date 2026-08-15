/**
 * What happens when the server tells this device it is no longer
 * authorized: a 403 (`revoked_or_unauthorized`) from any sync call, or an
 * explicit deactivation. The device must lock immediately and its cached
 * business data must become unreadable, without corrupting the local
 * database or losing the audit trail of what happened and when.
 */

import type { LocalDatabase } from "@/db/local-database";
import type { CredentialStore } from "@/security/credential-store";
import type { DeviceLockController } from "@/security/device-lock";

export interface RevocationHandlerDeps {
  db: LocalDatabase;
  credentials: CredentialStore;
  lockController: DeviceLockController;
}

/**
 * Ordering here is deliberate and safety-critical:
 *  1. Lock the UI first: no further user interaction with business data
 *     can start once this returns, even if a later step is slow.
 *  2. Purge cached business records (not the whole database: the device
 *     row, queued-mutation history, and audit trail are kept so the audit
 *     log and re-activation flow have something to reason about).
 *  3. Delete every credential (tokens and the payload encryption key) so
 *     even a process that somehow bypassed the lock screen could not
 *     decrypt anything.
 *  4. Mark the device row itself deactivated.
 *  5. Record the audit event last, once every safety-relevant step above
 *     has actually completed.
 *
 * Any queued-but-unsent local mutations are deliberately left in the
 * mutation queue table (not purged): they represent real offline work a
 * user did before revocation, and are exactly what an operator support
 * flow or a future re-activation may need to inspect, even though they can
 * no longer be sent while this device stays revoked.
 */
export async function handleRemoteRevocation(deps: RevocationHandlerDeps, deviceId: string): Promise<void> {
  deps.lockController.lockForRevocation();

  await deps.db.purgeAllCachedRecords();
  await deps.credentials.clear();
  await deps.db.deactivateDevice(deviceId, "revoked_by_server");

  await deps.db.appendAuditEvent("revocation_received", { deviceId });
  await deps.db.appendAuditEvent("protected_data_purged", { deviceId, reason: "revoked_by_server" });
  await deps.db.appendAuditEvent("device_locked", { deviceId, reason: "revoked" });
}
