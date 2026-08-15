import { describe, expect, it } from "vitest";
import { evaluateOfflineSessionExpiry, shouldLockForInactivity } from "@/security/session-policy";

describe("shouldLockForInactivity", () => {
  it("is false before the timeout elapses", () => {
    expect(shouldLockForInactivity({ lastActivityAt: 1000, now: 1000 + 59_000, inactivityTimeoutMs: 60_000 })).toBe(false);
  });

  it("is true exactly at the timeout boundary", () => {
    expect(shouldLockForInactivity({ lastActivityAt: 1000, now: 1000 + 60_000, inactivityTimeoutMs: 60_000 })).toBe(true);
  });

  it("is true well past the timeout", () => {
    expect(shouldLockForInactivity({ lastActivityAt: 0, now: 1_000_000, inactivityTimeoutMs: 60_000 })).toBe(true);
  });
});

describe("evaluateOfflineSessionExpiry", () => {
  const baseInput = {
    accessTokenExpiresAt: 100_000,
    lastSuccessfulServerContactAt: 50_000,
    isCurrentlyOnline: false,
    offlineGracePeriodMs: 10_000,
  };

  it("never expires an online session, even with an expired token: an online device can refresh instead", () => {
    expect(evaluateOfflineSessionExpiry({ ...baseInput, now: 500_000, isCurrentlyOnline: true })).toBeNull();
  });

  it("does not expire while the token is still valid", () => {
    expect(evaluateOfflineSessionExpiry({ ...baseInput, now: 99_999 })).toBeNull();
  });

  it("does not expire during the grace period after token expiry", () => {
    expect(evaluateOfflineSessionExpiry({ ...baseInput, now: 105_000 })).toBeNull();
  });

  it("expires once the token has expired and the grace period has elapsed while offline", () => {
    expect(evaluateOfflineSessionExpiry({ ...baseInput, now: 110_001 })).toBe("token_expired_and_offline");
  });

  it("reports never_contacted_server_and_token_expired when the device has never reached the server at all", () => {
    expect(
      evaluateOfflineSessionExpiry({ ...baseInput, lastSuccessfulServerContactAt: null, now: 110_001 }),
    ).toBe("never_contacted_server_and_token_expired");
  });
});
