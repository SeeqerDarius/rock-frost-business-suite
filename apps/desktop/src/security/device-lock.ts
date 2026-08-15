import {
  DEFAULT_INACTIVITY_TIMEOUT_MS,
  DEFAULT_OFFLINE_GRACE_PERIOD_MS,
  evaluateOfflineSessionExpiry,
  shouldLockForInactivity,
  type OfflineSessionExpiryReason,
} from "@/security/session-policy";

export type LockReason = "inactivity" | "manual" | "offline_session_expired" | "revoked";

export interface DeviceLockState {
  locked: boolean;
  reason: LockReason | null;
  offlineExpiryReason: OfflineSessionExpiryReason | null;
}

export interface DeviceLockControllerOptions {
  inactivityTimeoutMs?: number;
  offlineGracePeriodMs?: number;
  /** Injectable clock for tests — defaults to Date.now. */
  now?: () => number;
  /** Injectable timer functions for tests — default to the real globals. */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  /** How often the controller re-checks inactivity/offline-expiry. Kept short relative to the timeout so the UI reacts promptly. */
  checkIntervalMs?: number;
}

type Listener = (state: DeviceLockState) => void;

/**
 * Wires session-policy.ts's pure decisions to a real polling timer and
 * exposes a small pub/sub surface the shell UI subscribes to. Locking
 * itself only changes in-memory UI state and (for the "revoked" reason)
 * triggers a cached-data purge via security/revocation.ts — it never
 * touches the encrypted database's own key, so a correctly-unlocked app
 * regains access to its cache instantly without re-syncing.
 */
export class DeviceLockController {
  private readonly inactivityTimeoutMs: number;
  private readonly offlineGracePeriodMs: number;
  private readonly now: () => number;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly checkIntervalMs: number;

  private lastActivityAt: number;
  private state: DeviceLockState = { locked: false, reason: null, offlineExpiryReason: null };
  private listeners = new Set<Listener>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  // Populated by the sync engine so this controller can evaluate offline
  // expiry without importing the sync layer directly (keeps the dependency
  // direction one-way: sync -> security, never security -> sync).
  private accessTokenExpiresAt: number | null = null;
  private lastSuccessfulServerContactAt: number | null = null;
  private isCurrentlyOnline = false;

  constructor(options: DeviceLockControllerOptions = {}) {
    this.inactivityTimeoutMs = options.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;
    this.offlineGracePeriodMs = options.offlineGracePeriodMs ?? DEFAULT_OFFLINE_GRACE_PERIOD_MS;
    this.now = options.now ?? (() => Date.now());
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
    this.checkIntervalMs = options.checkIntervalMs ?? 15_000;
    this.lastActivityAt = this.now();
  }

  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = this.setIntervalFn(() => this.check(), this.checkIntervalMs);
  }

  stop(): void {
    if (!this.intervalHandle) return;
    this.clearIntervalFn(this.intervalHandle);
    this.intervalHandle = null;
  }

  recordActivity(): void {
    this.lastActivityAt = this.now();
    if (this.state.locked && this.state.reason === "inactivity") {
      // Recording activity alone does not unlock — see unlock(). This just
      // keeps the timestamp fresh so a subsequent explicit unlock doesn't
      // immediately re-lock on the very next check.
    }
  }

  updateSyncStatus(input: { accessTokenExpiresAt: number | null; lastSuccessfulServerContactAt: number | null; isOnline: boolean }): void {
    this.accessTokenExpiresAt = input.accessTokenExpiresAt;
    this.lastSuccessfulServerContactAt = input.lastSuccessfulServerContactAt;
    this.isCurrentlyOnline = input.isOnline;
  }

  lockForRevocation(): void {
    this.setState({ locked: true, reason: "revoked", offlineExpiryReason: null });
  }

  lockManually(): void {
    this.setState({ locked: true, reason: "manual", offlineExpiryReason: null });
  }

  /** Only inactivity and manual locks can be cleared this way — offline-expiry and revocation locks require going back through activation/re-authentication, since they mean this device's credentials can no longer be trusted at face value. */
  unlock(): boolean {
    if (this.state.reason === "offline_session_expired" || this.state.reason === "revoked") return false;
    this.recordActivity();
    this.setState({ locked: false, reason: null, offlineExpiryReason: null });
    return true;
  }

  getState(): DeviceLockState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private check(): void {
    if (this.state.locked) return;

    if (this.accessTokenExpiresAt !== null) {
      const expiryReason = evaluateOfflineSessionExpiry({
        accessTokenExpiresAt: this.accessTokenExpiresAt,
        lastSuccessfulServerContactAt: this.lastSuccessfulServerContactAt,
        now: this.now(),
        isCurrentlyOnline: this.isCurrentlyOnline,
        offlineGracePeriodMs: this.offlineGracePeriodMs,
      });
      if (expiryReason) {
        this.setState({ locked: true, reason: "offline_session_expired", offlineExpiryReason: expiryReason });
        return;
      }
    }

    if (shouldLockForInactivity({ lastActivityAt: this.lastActivityAt, now: this.now(), inactivityTimeoutMs: this.inactivityTimeoutMs })) {
      this.setState({ locked: true, reason: "inactivity", offlineExpiryReason: null });
    }
  }

  private setState(next: DeviceLockState): void {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}
