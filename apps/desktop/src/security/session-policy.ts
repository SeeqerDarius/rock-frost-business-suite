/**
 * Pure decision logic for when the desktop client must lock itself or treat
 * its session as expired. Deliberately factored out of DeviceLockController
 * (device-lock.ts), which wires this to real timers/wall-clock time, so the
 * actual policy is fully unit-testable without fake timers or a running
 * event loop — see session-policy.test.ts.
 */

export interface InactivityLockInput {
  /** Epoch milliseconds of the last recorded user interaction (keyboard, mouse, or touch). */
  lastActivityAt: number;
  now: number;
  /** How long the app may sit idle before it locks. */
  inactivityTimeoutMs: number;
}

/** True once `now` is at or past `lastActivityAt + inactivityTimeoutMs`. */
export function shouldLockForInactivity(input: InactivityLockInput): boolean {
  return input.now - input.lastActivityAt >= input.inactivityTimeoutMs;
}

export interface OfflineSessionExpiryInput {
  /** From ActivateDeviceResponse.accessTokenExpiresAt (or the latest refreshed value) — epoch milliseconds. */
  accessTokenExpiresAt: number;
  /** Epoch milliseconds of the last moment this device successfully reached the sync server (a successful push, pull, or token refresh). Null if it has never reached the server since activation. */
  lastSuccessfulServerContactAt: number | null;
  now: number;
  isCurrentlyOnline: boolean;
  /**
   * How much additional time past accessTokenExpiresAt the app tolerates
   * while offline before forcing a re-authentication, on top of the
   * token's own expiry — a deliberately short grace window, not an
   * offline-forever allowance. Financial/business data must not remain
   * writable indefinitely on a device that can't prove its session is
   * still valid.
   */
  offlineGracePeriodMs: number;
}

export type OfflineSessionExpiryReason = "token_expired_and_offline" | "never_contacted_server_and_token_expired";

/**
 * Online sessions are never force-expired here — an online device always
 * gets the chance to silently refresh its token instead (see
 * sync/sync-client.ts's refresh handling); this function only governs the
 * case where the device cannot reach the server to refresh at all.
 */
export function evaluateOfflineSessionExpiry(input: OfflineSessionExpiryInput): OfflineSessionExpiryReason | null {
  if (input.isCurrentlyOnline) return null;

  const tokenExpired = input.now >= input.accessTokenExpiresAt;
  if (!tokenExpired) return null;

  const graceDeadline = input.accessTokenExpiresAt + input.offlineGracePeriodMs;
  if (input.now < graceDeadline) return null;

  return input.lastSuccessfulServerContactAt === null
    ? "never_contacted_server_and_token_expired"
    : "token_expired_and_offline";
}

/** Defaults chosen for a business desktop app: short enough to matter for a shared/unattended machine, long enough not to be annoying on a personal one. Overridable per-deployment via DeviceLockController's constructor. */
export const DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const DEFAULT_OFFLINE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
