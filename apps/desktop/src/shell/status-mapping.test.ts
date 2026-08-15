import { describe, expect, it } from "vitest";
import { deriveShellStatus } from "@/shell/status-mapping";
import type { DeviceLockState } from "@/security/device-lock";

function lock(reason: DeviceLockState["reason"] = null): DeviceLockState {
  return { locked: reason !== null, reason, offlineExpiryReason: null };
}

describe("deriveShellStatus precedence", () => {
  it("revoked beats every other state, including an active sync", () => {
    expect(deriveShellStatus("syncing", lock("revoked"))).toBe("revoked");
    expect(deriveShellStatus("conflicts_pending", lock("revoked"))).toBe("revoked");
  });

  it("session_expired beats conflicts and syncing", () => {
    expect(deriveShellStatus("conflicts_pending", lock("offline_session_expired"))).toBe("session_expired");
    expect(deriveShellStatus("session_expired", lock())).toBe("session_expired");
  });

  it("conflict is shown once syncing settles into conflicts_pending", () => {
    expect(deriveShellStatus("conflicts_pending", lock())).toBe("conflict");
  });

  it("syncing is shown while a sync is actively running and nothing more severe is true", () => {
    expect(deriveShellStatus("syncing", lock())).toBe("syncing");
  });

  it("offline is shown when the last sync attempt failed with a network error", () => {
    expect(deriveShellStatus("offline", lock())).toBe("offline");
  });

  it("falls back to online once idle with nothing else pending", () => {
    expect(deriveShellStatus("idle", lock())).toBe("online");
  });
});
