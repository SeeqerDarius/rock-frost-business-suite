/**
 * Bounded exponential backoff with jitter, for exactly the error kinds the
 * contract marks retryable (429, 5xx, network failure — see
 * SyncClientError.retryable in contract/sync-contract.ts). 401/403/409/400
 * are never retried by this module; the caller (sync-client.ts) handles
 * those as immediate, distinct outcomes.
 */

export interface BackoffOptions {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  /** Injectable for deterministic tests — defaults to Math.random. */
  random?: () => number;
}

export const DEFAULT_BACKOFF_OPTIONS: BackoffOptions = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  maxAttempts: 6,
};

/**
 * Full-jitter exponential backoff (AWS's well-known formula:
 * `random(0, min(maxDelay, base * 2^attempt))`) rather than a fixed
 * multiplier — spreads out retries from many devices reconnecting at once
 * after a server blip, instead of having them all hammer the server in
 * lockstep on the same schedule.
 *
 * `attempt` is 0-indexed (the delay before the *first* retry, i.e. after
 * the first failure, is `computeBackoffDelayMs(0, ...)`).
 */
export function computeBackoffDelayMs(attempt: number, options: BackoffOptions = DEFAULT_BACKOFF_OPTIONS): number {
  const random = options.random ?? Math.random;
  const exponential = options.baseDelayMs * 2 ** attempt;
  const cappedDelay = Math.min(options.maxDelayMs, exponential);
  return Math.floor(random() * cappedDelay);
}

export function hasAttemptsRemaining(attemptCount: number, options: BackoffOptions = DEFAULT_BACKOFF_OPTIONS): boolean {
  return attemptCount < options.maxAttempts;
}

/**
 * Runs `operation`, retrying on a retryable failure per `options`, with a
 * real `setTimeout`-based delay between attempts (injectable for tests via
 * `sleepFn`, so unit tests don't have to wait out real backoff delays).
 * `isRetryable` decides whether a given error should trigger another
 * attempt; anything else is thrown immediately.
 */
export async function withBackoffRetry<T>(
  operation: (attempt: number) => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  options: BackoffOptions = DEFAULT_BACKOFF_OPTIONS,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await operation(attempt);
    } catch (error) {
      // `attempt` (0-indexed) is the call that just failed; `attemptsMade`
      // is how many calls have happened in total so far. maxAttempts is a
      // total-attempts cap (including the first try, not "N retries on top
      // of it") — checking with attemptsMade, not the raw 0-indexed
      // `attempt`, is what makes maxAttempts: 3 mean exactly 3 calls total,
      // not 4. See retry.test.ts.
      const attemptsMade = attempt + 1;
      const canRetry = isRetryable(error) && hasAttemptsRemaining(attemptsMade, options);
      if (!canRetry) throw error;
      const delay = computeBackoffDelayMs(attempt, options);
      await sleepFn(delay);
      attempt += 1;
    }
  }
}
