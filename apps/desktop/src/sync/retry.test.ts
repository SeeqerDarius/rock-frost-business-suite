import { describe, expect, it, vi } from "vitest";
import { computeBackoffDelayMs, hasAttemptsRemaining, withBackoffRetry } from "@/sync/retry";

describe("computeBackoffDelayMs", () => {
  it("never exceeds maxDelayMs even at a high attempt count", () => {
    const delay = computeBackoffDelayMs(20, { baseDelayMs: 1000, maxDelayMs: 30_000, maxAttempts: 6, random: () => 1 });
    expect(delay).toBeLessThanOrEqual(30_000);
  });

  it("grows exponentially with attempt number before hitting the cap", () => {
    const options = { baseDelayMs: 1000, maxDelayMs: 100_000, maxAttempts: 10, random: () => 1 };
    const delay0 = computeBackoffDelayMs(0, options);
    const delay1 = computeBackoffDelayMs(1, options);
    const delay2 = computeBackoffDelayMs(2, options);
    expect(delay1).toBeGreaterThan(delay0);
    expect(delay2).toBeGreaterThan(delay1);
  });

  it("applies full jitter: a random() of 0 always yields a 0ms delay", () => {
    const delay = computeBackoffDelayMs(3, { baseDelayMs: 1000, maxDelayMs: 30_000, maxAttempts: 6, random: () => 0 });
    expect(delay).toBe(0);
  });
});

describe("hasAttemptsRemaining", () => {
  it("is true below maxAttempts and false at or beyond it", () => {
    const options = { baseDelayMs: 1000, maxDelayMs: 30_000, maxAttempts: 3 };
    expect(hasAttemptsRemaining(0, options)).toBe(true);
    expect(hasAttemptsRemaining(2, options)).toBe(true);
    expect(hasAttemptsRemaining(3, options)).toBe(false);
  });
});

describe("withBackoffRetry", () => {
  it("retries a retryable failure until it succeeds, sleeping between attempts", async () => {
    let calls = 0;
    const sleepFn = vi.fn(async () => {});
    const result = await withBackoffRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("transient");
        return "ok";
      },
      () => true,
      { baseDelayMs: 10, maxDelayMs: 100, maxAttempts: 5, random: () => 0.5 },
      sleepFn,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately without sleeping when the error is not retryable", async () => {
    const sleepFn = vi.fn(async () => {});
    await expect(
      withBackoffRetry(
        async () => {
          throw new Error("permanent");
        },
        () => false,
        { baseDelayMs: 10, maxDelayMs: 100, maxAttempts: 5 },
        sleepFn,
      ),
    ).rejects.toThrow("permanent");
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it("gives up and throws once maxAttempts is exhausted, even for a retryable error", async () => {
    let calls = 0;
    await expect(
      withBackoffRetry(
        async () => {
          calls += 1;
          throw new Error("always fails");
        },
        () => true,
        { baseDelayMs: 1, maxDelayMs: 5, maxAttempts: 3, random: () => 0 },
        async () => {},
      ),
    ).rejects.toThrow("always fails");
    // maxAttempts=3 means attempts 0,1,2 all run (the initial try plus two
    // retries), and the third failure (attempt index 2) has no attempts
    // remaining left to retry into.
    expect(calls).toBe(3);
  });
});
