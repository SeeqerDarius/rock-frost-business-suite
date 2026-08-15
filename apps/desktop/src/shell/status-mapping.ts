/**
 * Reduces the sync engine's state and the device lock's state down to the
 * single status indicator the shell chrome shows at all times. Kept as
 * pure logic (no React) so the precedence rules: revoked beats everything,
 * an expired offline session beats "just conflicts", etc.: are directly
 * unit-testable. See shell/status-mapping.test.ts.
 */

import type { SyncState } from "@/sync/sync-engine";
import type { DeviceLockState } from "@/security/device-lock";

export type ShellStatusIndicator = "revoked" | "session_expired" | "conflict" | "syncing" | "offline" | "online";

export const STATUS_PRECEDENCE: readonly ShellStatusIndicator[] = [
  "revoked",
  "session_expired",
  "conflict",
  "syncing",
  "offline",
  "online",
];

export function deriveShellStatus(syncState: SyncState, lockState: DeviceLockState): ShellStatusIndicator {
  if (lockState.reason === "revoked" || syncState === "revoked") return "revoked";
  if (lockState.reason === "offline_session_expired" || syncState === "session_expired") return "session_expired";
  if (syncState === "conflicts_pending") return "conflict";
  if (syncState === "syncing") return "syncing";
  if (syncState === "offline") return "offline";
  return "online";
}
