import { describe, expect, it, vi } from "vitest";
import { DeviceLockController } from "@/security/device-lock";

/** A tiny fake clock + interval scheduler so the controller's periodic check can be driven deterministically without real timers. */
function createFakeClock(startAt = 0) {
  let now = startAt;
  const handlers: { fn: () => void; intervalMs: number; elapsed: number }[] = [];
  return {
    now: () => now,
    setIntervalFn: ((fn: () => void, intervalMs: number) => {
      const handle = { fn, intervalMs, elapsed: 0 };
      handlers.push(handle);
      return handle as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval,
    clearIntervalFn: ((handle: unknown) => {
      const index = handlers.indexOf(handle as (typeof handlers)[number]);
      if (index >= 0) handlers.splice(index, 1);
    }) as typeof clearInterval,
    advance(ms: number) {
      now += ms;
      for (const handler of handlers) {
        handler.elapsed += ms;
        while (handler.elapsed >= handler.intervalMs) {
          handler.elapsed -= handler.intervalMs;
          handler.fn();
        }
      }
    },
  };
}

describe("DeviceLockController: inactivity", () => {
  it("keeps browser timer functions bound to the global receiver", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const controller = new DeviceLockController({ checkIntervalMs: 60_000 });

    expect(() => controller.start()).not.toThrow();
    controller.stop();

    expect(setIntervalSpy).toHaveBeenCalledOnce();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("locks once the inactivity timeout elapses with no recorded activity", () => {
    const clock = createFakeClock();
    const controller = new DeviceLockController({
      inactivityTimeoutMs: 60_000,
      checkIntervalMs: 5_000,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
    });
    controller.start();

    clock.advance(59_000);
    expect(controller.getState().locked).toBe(false);

    clock.advance(5_000); // crosses the 60s boundary on the next 5s check tick
    expect(controller.getState()).toMatchObject({ locked: true, reason: "inactivity" });
  });

  it("recordActivity resets the inactivity clock", () => {
    const clock = createFakeClock();
    const controller = new DeviceLockController({
      inactivityTimeoutMs: 60_000,
      checkIntervalMs: 5_000,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
    });
    controller.start();

    clock.advance(55_000);
    controller.recordActivity();
    clock.advance(55_000);

    expect(controller.getState().locked).toBe(false);
  });

  it("unlock() clears an inactivity lock and notifies subscribers", () => {
    const clock = createFakeClock();
    const controller = new DeviceLockController({
      inactivityTimeoutMs: 10_000,
      checkIntervalMs: 1_000,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
    });
    controller.start();
    clock.advance(11_000);
    expect(controller.getState().locked).toBe(true);

    const listener = vi.fn();
    controller.subscribe(listener);
    const result = controller.unlock();

    expect(result).toBe(true);
    expect(controller.getState()).toMatchObject({ locked: false, reason: null });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ locked: false }));
  });
});

describe("DeviceLockController: revocation and offline expiry cannot be cleared by unlock()", () => {
  it("unlock() refuses to clear a revocation lock", () => {
    const controller = new DeviceLockController();
    controller.lockForRevocation();
    expect(controller.unlock()).toBe(false);
    expect(controller.getState()).toMatchObject({ locked: true, reason: "revoked" });
  });

  it("unlock() refuses to clear an offline-session-expired lock", () => {
    const clock = createFakeClock();
    const controller = new DeviceLockController({
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      checkIntervalMs: 1_000,
    });
    controller.updateSyncStatus({ accessTokenExpiresAt: 500, lastSuccessfulServerContactAt: 0, isOnline: false });
    controller.start();
    clock.advance(600); // past accessTokenExpiresAt + default grace... use a short grace instead below
    // Use a controller with a short grace period to make this deterministic.
    const shortGraceController = new DeviceLockController({
      offlineGracePeriodMs: 100,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      checkIntervalMs: 50,
    });
    shortGraceController.updateSyncStatus({ accessTokenExpiresAt: clock.now(), lastSuccessfulServerContactAt: 0, isOnline: false });
    shortGraceController.start();
    clock.advance(200);

    expect(shortGraceController.getState()).toMatchObject({ locked: true, reason: "offline_session_expired" });
    expect(shortGraceController.unlock()).toBe(false);
  });
});
